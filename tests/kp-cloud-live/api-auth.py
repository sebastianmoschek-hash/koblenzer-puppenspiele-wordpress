"""Exercise real PHP HTTP host, login and CSRF guards without Google calls."""
import pathlib, tempfile, shutil, subprocess, urllib.request, urllib.error, time, socket
with tempfile.TemporaryDirectory() as tmp:
    root=pathlib.Path(tmp)/'neu'; api=root/'api';api.mkdir(parents=True)
    shutil.copy('deployments/kp-code-editor/ai-draft.php',api/'ai-draft.php')
    (api/'auth.php').write_text("<?php $_SERVER['HTTPS']='on'; $_SESSION=['studio_csrf'=>'test-csrf']; function current_admin_username(){return ($_SERVER['HTTP_X_TEST_LOGIN']??'')==='yes'?'test':null;}")
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    server=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:
                with socket.create_connection(('127.0.0.1',port),timeout=.1):break
            except OSError:time.sleep(.05)
        cases=[('wrong.example',{},403),('neu.koblenzer-puppenspiele.de',{},401),('neu.koblenzer-puppenspiele.de',{'X-Test-Login':'yes'},403)]
        for host,headers,status in cases:
            req=urllib.request.Request(f'http://127.0.0.1:{port}/api/ai-draft.php',data=b'{"action":"live-token"}',headers={'Host':host,'Content-Type':'application/json',**headers})
            try:urllib.request.urlopen(req);raise AssertionError('Guard unexpectedly permitted request')
            except urllib.error.HTTPError as error:assert error.code==status,(error.code,status)
        print('Host, unauthenticated access and CSRF rejection passed.')
    finally:server.terminate();server.wait(timeout=5)
