<?php
/** Expose the direct Live image tool through the generic edit_element contract. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'kp_ai_repair_code' ) ) { return; }
    ?>
    <script id="kp-mobile-live-image-adapter-runtime">
    (()=>{
      'use strict';
      if(!/KoblenzerPuppenspieleTechnician\//.test(navigator.userAgent))return;
      function attach(){
        const api=window.KPRepairMobile;
        if(!api?.ready||typeof api.editImage!=='function'||typeof api.editableElements!=='function'||typeof api.editElement!=='function')return false;
        if(api.imagePromptAdapterReady)return true;
        const oldElements=api.editableElements.bind(api);
        const oldEdit=api.editElement.bind(api);
        const oldContext=typeof api.context==='function'?api.context.bind(api):null;
        api.editableElements=()=>{
          const out=oldElements()||{};
          for(const item of out.content||[]){
            if(item?.kind==='image'){
              item.properties=Array.isArray(item.properties)?item.properties:[];
              if(!item.properties.includes('image_prompt'))item.properties.push('image_prompt');
            }
          }
          out.directImageEdit=true;
          out.imageEditHint='Für inhaltliche/generative Bildänderungen edit_element mit property=image_prompt und dem Änderungswunsch als value verwenden.';
          return out;
        };
        api.editElement=async(liveId,property,value)=>{
          if(String(property||'')==='image_prompt')return api.editImage(liveId,String(value||''));
          return oldEdit(liveId,property,value);
        };
        if(oldContext){
          api.context=()=>{
            const out=oldContext()||{};
            out.directImageEdit={available:true,tool:'edit_element',property:'image_prompt'};
            return out;
          };
        }
        api.imagePromptAdapterReady=true;
        return true;
      }
      if(!attach()){const timer=setInterval(()=>{if(attach())clearInterval(timer)},200)}
    })();
    </script>
    <?php
}, 2200 );
