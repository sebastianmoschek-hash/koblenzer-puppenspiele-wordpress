<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$origin=$_SERVER['HTTP_ORIGIN']??'';$host=strtolower($_SERVER['HTTP_HOST']??'');
if($host!=='neu.koblenzer-puppenspiele.de'||($origin!==''&&$origin!=='https://neu.koblenzer-puppenspiele.de')){http_response_code(403);echo json_encode(['error'=>'forbidden']);exit;}
$file=__DIR__.'/.editor-state.json';$historyDir=__DIR__.'/.editor-history';
function readState(string $path):?array{if(!is_file($path))return null;$data=json_decode((string)file_get_contents($path),true);return is_array($data)?$data:null;}
function historyList(string $dir):array{if(!is_dir($dir))return [];$out=[];foreach(glob($dir.'/*.json')?:[] as $path){$d=readState($path);if(!$d)continue;$out[]=['id'=>basename($path,'.json'),'savedAt'=>$d['savedAt']??null];}usort($out,fn($a,$b)=>strcmp((string)$b['savedAt'],(string)$a['savedAt']));return array_slice($out,0,50);}
$method=$_SERVER['REQUEST_METHOD'];$action=$_GET['action']??'';
if($method==='GET'&&$action==='history'){echo json_encode(['ok'=>true,'versions'=>historyList($historyDir)],JSON_UNESCAPED_UNICODE);exit;}
if($method==='GET'&&$action==='version'){$id=preg_replace('/[^0-9A-Za-z_-]/','',$_GET['id']??'');$d=$id!==''?readState($historyDir.'/'.$id.'.json'):null;if(!$d){http_response_code(404);echo json_encode(['error'=>'version not found']);exit;}$d['ok']=true;echo json_encode($d,JSON_UNESCAPED_UNICODE);exit;}
if($method==='GET'){$data=readState($file);if(!$data){echo json_encode(['ok'=>true,'exists'=>false,'version'=>3]);exit;}$data['ok']=true;$data['exists']=true;echo json_encode($data,JSON_UNESCAPED_UNICODE);exit;}
if($method!=='PUT'){http_response_code(405);exit;}
$input=json_decode((string)file_get_contents('php://input'),true);if(!is_array($input)||!is_string($input['html']??null)||strlen($input['html'])>2000000){http_response_code(422);echo json_encode(['error'=>'invalid payload']);exit;}
$layout=is_array($input['layout']??null)?$input['layout']:[];
if(!is_dir($historyDir)&&!mkdir($historyDir,0750,true)&&!is_dir($historyDir)){http_response_code(500);echo json_encode(['error'=>'history unavailable']);exit;}
$previous=readState($file);if($previous&&is_string($previous['html']??null)){$prevTime=$previous['savedAt']??gmdate('c');$prevId=gmdate('Ymd-His',strtotime((string)$prevTime)?:time()).'-'.substr(hash('sha256',$previous['html'].json_encode($previous['layout']??[])),0,8);$prevPath=$historyDir.'/'.$prevId.'.json';if(!is_file($prevPath))file_put_contents($prevPath,json_encode($previous,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),LOCK_EX);}
$data=['version'=>3,'savedAt'=>gmdate('c'),'html'=>$input['html'],'layout'=>$layout];$tmp=$file.'.tmp';if(file_put_contents($tmp,json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),LOCK_EX)===false||!rename($tmp,$file)){http_response_code(500);echo json_encode(['error'=>'save failed']);exit;}
$currentId=gmdate('Ymd-His').'-'.substr(hash('sha256',$data['html'].json_encode($data['layout'])),0,8);file_put_contents($historyDir.'/'.$currentId.'.json',json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),LOCK_EX);
$files=glob($historyDir.'/*.json')?:[];usort($files,fn($a,$b)=>filemtime($b)<=>filemtime($a));foreach(array_slice($files,50) as $old)@unlink($old);
echo json_encode(['ok'=>true,'exists'=>true,'savedAt'=>$data['savedAt'],'versionId'=>$currentId,'version'=>3]);
