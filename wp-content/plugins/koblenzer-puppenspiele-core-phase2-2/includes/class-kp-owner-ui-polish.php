<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Small front-end owner/UI refinements that must stay independent from the
 * editor persistence path:
 * - make the owner edit entry unobtrusive on phones
 * - make Instagram immediately recognizable as Instagram
 */
final class KP_Owner_UI_Polish {
    public static function init() {
        add_action( 'wp_footer', array( __CLASS__, 'render' ), 1200 );
    }

    public static function render() {
        if ( is_admin() ) { return; }
        ?>
        <style id="kp-owner-ui-polish-css">
          /* Keep the owner entry reachable without covering a wide strip of content. */
          @media(max-width:640px){
            .kp-owner-single-edit{
              left:0!important;
              bottom:max(12px,env(safe-area-inset-bottom))!important;
              width:46px!important;
              min-width:46px!important;
              height:48px!important;
              min-height:48px!important;
              justify-content:center!important;
              gap:0!important;
              overflow:hidden!important;
              padding:0!important;
              border-left:0!important;
              border-radius:0 16px 16px 0!important;
              font-size:0!important;
              transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease!important;
            }
            .kp-owner-single-edit::before{
              content:"✏️";
              display:block;
              font-size:20px;
              line-height:1;
            }
            .kp-owner-single-edit.is-kp-scrolling{
              transform:translateX(-29px)!important;
              opacity:.42!important;
              box-shadow:0 7px 20px rgba(0,0,0,.22)!important;
            }
            .kp-owner-single-edit:focus,
            .kp-owner-single-edit:active{
              transform:translateX(0)!important;
              opacity:1!important;
            }
          }

          /* Instagram: familiar camera glyph + Instagram-style gradient. */
          .kp-social-instagram .kp-social-mark{
            width:1.55em!important;
            height:1.55em!important;
            flex:0 0 1.55em;
            overflow:hidden;
            border:0!important;
            border-radius:.43em!important;
            background:radial-gradient(circle at 31% 107%,#fdf497 0 8%,#fdf497 8% 14%,#fd5949 34%,#d6249f 61%,#285aeb 100%)!important;
            color:#fff!important;
            box-shadow:0 2px 7px rgba(214,36,159,.28);
          }
          .kp-social-instagram .kp-social-mark svg{
            display:block;
            width:72%;
            height:72%;
            overflow:visible;
          }
          .kp-social-home.kp-social-instagram{
            border-color:transparent!important;
            background:radial-gradient(circle at 31% 107%,#fdf497 0 8%,#fd5949 34%,#d6249f 61%,#285aeb 100%)!important;
            color:#fff!important;
            box-shadow:0 7px 20px rgba(214,36,159,.25);
          }
          .kp-social-footer.kp-social-instagram,
          .kp-social-menu.kp-social-instagram{
            border-color:rgba(214,36,159,.48)!important;
          }
        </style>
        <script id="kp-owner-ui-polish-js">
        (()=>{
          'use strict';

          const editButton=document.querySelector('.kp-owner-single-edit');
          if(editButton){
            editButton.setAttribute('title','Website bearbeiten');
            editButton.setAttribute('aria-label','Website bearbeiten');
            let scrollTimer=0;
            window.addEventListener('scroll',()=>{
              editButton.classList.add('is-kp-scrolling');
              window.clearTimeout(scrollTimer);
              scrollTimer=window.setTimeout(()=>editButton.classList.remove('is-kp-scrolling'),520);
            },{passive:true});
          }

          const instagramSvg='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.1" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.7" r="1.25" fill="currentColor"/></svg>';
          const upgradeInstagram=()=>{
            document.querySelectorAll('.kp-social-instagram .kp-social-mark').forEach(mark=>{
              if(mark.dataset.kpInstagramIcon==='1')return;
              mark.dataset.kpInstagramIcon='1';
              mark.innerHTML=instagramSvg;
            });
          };

          if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',upgradeInstagram,{once:true});
          else upgradeInstagram();

          const observer=new MutationObserver(upgradeInstagram);
          if(document.body)observer.observe(document.body,{childList:true,subtree:true});
          window.setTimeout(()=>observer.disconnect(),5000);
        })();
        </script>
        <?php
    }
}
