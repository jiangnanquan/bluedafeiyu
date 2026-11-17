export function createUtilityPages(ctx) {
  const { works, chars, tr, old, icon, button, card, grid, roleCard, pageHead, write } = ctx;
write('/404.html','找不到这一页','404',`${pageHead('404 · NOT FOUND',tr('missingPage','这一页游走了。','This page swam away.','このページは泳いでいきました。'),tr('missingDesc','你访问的地址可能已下架、移动，或者拼写有误。','The page may have been removed, moved, or the address may be misspelled.','ページが削除・移動されたか、アドレスに誤りがある可能性があります。'))}<aside class="note">${icon('search',20)}<p>${tr('missingHelp','可以回到首页或全部图片重新浏览，也可以用搜索页找找角色名或关键词。','Return to the home page or archive, or search for a character or keyword.','ホームや画像一覧へ戻るか、キャラクター名やキーワードで検索してください。')}</p></aside><div class="nf-actions">${button('/',tr('backHome','回到首页','Home','ホームへ'),'primary')}${button('/browse.html',tr('backGallery','逛全部图片','Browse images','画像一覧へ'))}${button('/search.html',old('v2.search','搜索'))}${button('/submit.html',old('nav.submit','投稿'))}</div>`,{robots:'noindex,follow'});
write('/category.html','角色','characters',`${pageHead('CHARACTERS',old('v2.nav.characters','角色'))}<div class="role-grid">${chars.map(roleCard).join('')}</div>`,{attrs:'data-legacy-category'});

}
