#!/bin/bash
V=wi005vol; I=wi005-acl-test
docker volume create $V >/dev/null
echo "== 1. host provisions workspace (like createWorkspace, host uid 1000)"
docker run --rm -v $V:/app --entrypoint sh $I -c 'chown 1000:1000 /app && chmod 700 /app && setfacl -m u:10001:rwx,u:1000:rwx,m:rwx /app && setfacl -d -m u::rwx,u:10001:rwx,u:1000:rwx,g::---,m::rwx,o::--- /app && echo ok'
echo "== 2. host (uid1000) materializes snapshot"
docker run --rm -v $V:/app --user 1000:1000 --entrypoint sh $I -c 'mkdir -p /app/src && echo "<?php" > /app/composer.json && echo x > /app/src/host.php && echo ok'
echo "== 3. runner (uid10001, cap-drop ALL): composer-like work + adversarial chmod"
docker run --rm -v $V:/app --user 10001:10001 --cap-drop ALL --entrypoint sh $I -c '
 mkdir -p /app/vendor/pkg/deep /app/storage/logs && echo a > /app/vendor/pkg/deep/a.php && echo l > /app/storage/logs/l.log
 chmod 000 /app/vendor/pkg/deep/a.php; chmod 000 /app/vendor/pkg/deep; chmod 500 /app/storage; chmod 000 /app/storage/logs/l.log; chmod 700 /app/vendor/pkg; echo adversarial-done'
CHECK='for d in /app /app/vendor /app/vendor/pkg /app/vendor/pkg/deep /app/storage /app/storage/logs; do [ -r $d ] && [ -w $d ] && [ -x $d ] && echo "dir OK      $d" || echo "dir DENIED  $d"; done; for f in /app/vendor/pkg/deep/a.php /app/storage/logs/l.log /app/src/host.php; do [ -r $f ] && echo "file OK     $f" || echo "file DENIED $f"; done'
echo "== 4. host uid1000 BEFORE recovery"
docker run --rm -v $V:/app --user 1000:1000 --cap-drop ALL --entrypoint sh $I -c "$CHECK"
echo "== 5. runner-side recovery (uid10001, cap-drop ALL, no network)"
docker run --rm -v $V:/app --user 10001:10001 --cap-drop ALL --network none $I restore-workspace-acl 1000 /app; echo "exit=$?"
echo "== 6. host uid1000 AFTER recovery"
docker run --rm -v $V:/app --user 1000:1000 --cap-drop ALL --entrypoint sh $I -c "$CHECK"
echo "== 7. isolation: uid 20000 (another user/execution)"
docker run --rm -v $V:/app --user 20000:20000 --cap-drop ALL --entrypoint sh $I -c 'ls /app 2>&1 | head -1; touch /app/x 2>&1 | head -1'
docker volume rm -f $V >/dev/null; echo cleaned
