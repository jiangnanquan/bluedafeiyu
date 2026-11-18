(() => {
  let loading;
  function load() {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);
    loading ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      const timer = setTimeout(fail, 12000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        reject(new Error('Turnstile could not load'));
      }
      script.onerror = fail;
      script.onload = () => {
        clearTimeout(timer);
        if (window.turnstile?.render) resolve(window.turnstile);
        else fail();
      };
      document.head.append(script);
    }).catch(error => { loading = null; throw error; });
    return loading;
  }

  const failureCopy = '人机验证加载失败。请检查网络后刷新页面重试。';
  const failureKey = 'submit.form.turnstileLoadError';
  function install({sitekey,row,slot,status,onToken}) {
    if (!sitekey) return null;
    let api, widget = null, pending = false, failed = false, generation = 0, theme;
    const paintStatus = () => {
      status.hidden = !failed;
      status.textContent = failed ? window.SiteLang?.fmt(failureKey,failureCopy) || failureCopy : '';
    };
    const setFailure = value => {
      failed = value;
      paintStatus();
    };
    async function mount() {
      if (pending || widget !== null || row.parentElement.closest('[hidden]')) return;
      row.hidden = false;
      pending = true;
      try {
        api = await load();
        if (row.parentElement.closest('[hidden]')) return;
        theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        const ticket = ++generation;
        const isCurrent = () => ticket === generation;
        setFailure(false);
        widget = api.render(slot, {
          sitekey, theme,
          size: slot.clientWidth < 300 ? 'compact' : 'flexible',
          callback(value) { if (isCurrent()) { onToken(value || ''); setFailure(false); } },
          'expired-callback'() { if (isCurrent()) onToken(''); },
          'error-callback'() {
            if (isCurrent()) { onToken(''); setFailure(true); }
          }
        });
      } catch {
        onToken('');
        setFailure(true);
      } finally { pending = false; }
    }
    document.addEventListener('site:themechange', ({detail}) => {
      if (widget !== null && detail.theme !== theme) {
        generation++;
        api.remove(widget);
        widget = null;
        onToken('');
      }
      mount();
    });
    document.addEventListener('site:submissiontab', mount);
    document.addEventListener('site:langchange', paintStatus);
    mount();
    return {
      get failed() { return failed; },
      reset() {
        onToken('');
        if (widget !== null) api.reset(widget);
      }
    };
  }
  window.SiteTurnstile = {install,failureKey,failureCopy};
})();
