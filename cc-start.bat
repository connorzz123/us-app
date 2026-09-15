@echo off
rem 本地启动脚本。密钥从环境变量或 .env 读取，不再明文写在脚本里。
rem 用法：先在系统环境变量或本机 .env 中配置 ANTHROPIC_AUTH_TOKEN，再运行本脚本。
npx @anthropic-ai/claude-code %*
