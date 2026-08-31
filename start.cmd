@echo off
REM اجرای کاملِ محیطِ توسعه: پایگاه‌داده + مایگریشن + اپ
cd /d "%~dp0"
echo [1/3] بالا آوردن پایگاه داده...
docker compose up -d db
timeout /t 6 /nobreak >nul
echo [2/3] اجرای مایگریشن‌ها...
call pnpm db:migrate
echo [3/3] اجرای اپ روی http://localhost:3000
call pnpm dev
