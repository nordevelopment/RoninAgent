import fs from 'node:fs';
import { execSync } from 'node:child_process';

if (!fs.existsSync('node_modules')) {
  console.log('⚠️  Папка node_modules не найдена! Автоматически запускаем npm install...\n');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('\n✅ Зависимости успешно установлены!\n');
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении npm install:', error);
    process.exit(1);
  }
}

// Проверяем наличие production-билда перед запуском start
const isPrestart = process.env.npm_lifecycle_event === 'prestart';
const hasBuild = fs.existsSync('dist/backend/server.js') && fs.existsSync('dist/frontend/index.html');

if (isPrestart && !hasBuild) {
  console.log('📦 Сборка не найдена. Собираем проект перед первым запуском (npm run build)...\n');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('\n✅ Сборка успешно завершена!\n');
  } catch (error) {
    console.error('\n❌ Ошибка при сборке проекта:', error);
    process.exit(1);
  }
}

