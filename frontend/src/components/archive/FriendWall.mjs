import {renderCommunityProjects,renderFriendDirectory} from './LinkDirectories.mjs';
export function createFriendWall(ctx) {
 const {tr,pageHead,sectionHead,write}=ctx;
 const title=tr('friendsWall','项目与友链','Projects & friend links','プロジェクトとリンク集');
 const content=`${pageHead('PROJECTS & FRIENDS',title,tr('friendsLead','从社区项目与朋友们的网站，继续发现更多有趣的创作。','Discover more creations through community projects and friends’ websites.','コミュニティのプロジェクトや友だちのサイトから、さらに創作に出会いましょう。'))}${sectionHead(tr('friendsCategory.project','项目类','Projects','プロジェクト'),'','/community-projects.html',tr('communityProjectsTitle','社区项目','Community projects','コミュニティのプロジェクト'))}${renderCommunityProjects(ctx,{heading:false,note:false})}${sectionHead(tr('friendsCategory.website','网站类','Websites','ウェブサイト'),'','/friend-links.html',tr('friendsTitle','友链墙','Friend links','リンク集'))}${renderFriendDirectory(ctx,{heading:false,note:false})}`;
 write('/projects.html','项目与友链','projects',content);
}
export function createIndependentFriendPages(ctx) {
 const {tr,write}=ctx;
 tr('links.projects.filters','项目筛选','Project filters','プロジェクトの絞り込み');
 write('/community-projects.html','社区项目','communityProjects',renderCommunityProjects(ctx),{attrs:'data-independent-section="project" data-link-directory-page'});
 write('/friend-links.html','友情链接','friendWall',renderFriendDirectory(ctx),{attrs:'data-independent-section="website" data-link-directory-page'});
}
