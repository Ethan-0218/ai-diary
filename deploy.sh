#!/bin/bash
set -euo pipefail

# ============================================================
# AI Diary — EC2 배포 스크립트 (naming-studio 패턴)
#   ./deploy.sh           # 코드 배포 (git pull → install → build → pm2 restart)
#   ./deploy.sh --setup    # 최초 서버 세팅 (1회)
# 백엔드(NestJS API)만 배포한다. DB는 공유 RDS의 aidiary(+pgvector).
# 모바일/웹은 별도. .env는 서버의 $API_PATH/.env (커밋 금지).
# ============================================================

SSH_KEY="${SSH_KEY:-$HOME/.ssh/samshintalk.pem}"
SSH_USER="ubuntu"
EC2_HOST="54.180.93.123"
REPO_URL="https://github.com/Ethan-0218/ai-diary.git"
REPO_PATH="/srv/ai-diary"
API_PATH="/srv/ai-diary/apps/api"
SSH_CMD="ssh -i $SSH_KEY $SSH_USER@$EC2_HOST"

log() { echo -e "\033[0;32m[deploy]\033[0m $1"; }

setup_server() {
  log "EC2 최초 세팅..."
  $SSH_CMD bash -s << SETUP_EOF
set -euo pipefail
export NVM_DIR="\$HOME/.nvm"; [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
sudo mkdir -p $API_PATH/logs && sudo chown -R ubuntu:ubuntu /srv/ai-diary || mkdir -p $API_PATH/logs
command -v pnpm >/dev/null || npm install -g pnpm
command -v pm2  >/dev/null || npm install -g pm2
[ -d "$REPO_PATH/.git" ] || git clone $REPO_URL $REPO_PATH
echo "✓ 세팅 완료. 다음: $API_PATH/.env 작성 후 ./deploy.sh"
SETUP_EOF
}

deploy_code() {
  log "EC2 배포 시작..."
  $SSH_CMD bash -s << REMOTE_EOF
set -euo pipefail
export NVM_DIR="\$HOME/.nvm"; [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
cd $REPO_PATH
echo "▶ git pull..."; git pull origin main
echo "▶ pnpm install..."; pnpm install --frozen-lockfile
echo "▶ build shared..."; pnpm --filter @ai-diary/shared build
echo "▶ build api...";    pnpm --filter @ai-diary/api build
echo "▶ pm2..."
cd $API_PATH
if pm2 describe ai-diary-api > /dev/null 2>&1; then pm2 restart ai-diary-api --update-env; else pm2 start ecosystem.config.js && pm2 save; fi
pm2 status
REMOTE_EOF
  log "배포 완료!"
}

case "${1:-}" in
  --setup) setup_server ;;
  "")      deploy_code ;;
  *) echo "Usage: $0 [--setup]"; exit 1 ;;
esac
