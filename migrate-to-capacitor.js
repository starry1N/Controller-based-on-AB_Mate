#!/usr/bin/env node

/**
 * Capacitor 自动迁移脚本
 * 用法: node migrate-to-capacitor.js [options]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const isForce = args.includes('--force') || args.includes('-f');
const interactive = !args.includes('--no-interactive');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function success(msg) { log(`✅ ${msg}`, 'green'); }
function error(msg) { log(`❌ ${msg}`, 'red'); }
function warning(msg) { log(`⚠️  ${msg}`, 'yellow'); }
function info(msg) { log(`ℹ️  ${msg}`, 'cyan'); }
function step(msg) { log(`\n📋 ${msg}`, 'blue'); }

// 检查工具
function checkTools() {
  step('检查必要工具...');

  const tools = [
    { cmd: 'node --version', name: 'Node.js' },
    { cmd: 'npm --version', name: 'npm' },
    { cmd: 'java -version', name: 'Java' },
  ];

  let allOk = true;

  for (const tool of tools) {
    try {
      execSync(tool.cmd, { stdio: 'ignore' });
      success(`${tool.name} 已安装`);
    } catch {
      error(`${tool.name} 未安装或未配置`);
      allOk = false;
    }
  }

  return allOk;
}

// 创建目录
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 复制文件
function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

// 备份原文件
function backupFile(filePath) {
  if (fs.existsSync(filePath)) {
    const backupPath = `${filePath}.backup`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
      info(`已备份: ${filePath} → ${backupPath}`);
    }
  }
}

// 主要迁移逻辑
async function migrate() {
  log('\n╔════════════════════════════════════════╗', 'bright');
  log('║  Electron App → Android APK 迁移工具  ║', 'bright');
  log('╚════════════════════════════════════════╝\n', 'bright');

  // 第 1 步：检查工具
  if (!checkTools()) {
    error('必要工具检查失败，请先安装所需工具');
    process.exit(1);
  }

  // 第 2 步：备份文件
  step('备份关键文件...');
  backupFile('package.json');
  backupFile('capacitor.config.ts');
  success('文件备份完成');

  // 第 3 步：复制配置文件
  step('配置 Capacitor...');

  const files = [
    ['capacitor.config.ts', './capacitor.config.ts'],
    ['package-capacitor.json', './package.json'],
    ['vite.config.capacitor.ts', './vite.config.ts'],
    ['src/renderer/services/BLEServiceCapacitor.ts', './src/renderer/services/BLEService.ts'],
  ];

  let copiedCount = 0;
  for (const [src, dest] of files) {
    if (copyFile(src, dest)) {
      success(`已复制: ${src} → ${dest}`);
      copiedCount++;
    }
  }

  if (copiedCount === files.length) {
    success('所有配置文件已部署');
  } else {
    warning('部分配置文件复制失败，请检查源文件位置');
  }

  // 第 4 步：安装依赖
  step('安装 npm 依赖...');
  try {
    info('这可能需要几分钟，请耐心等待...');
    execSync('npm install', { stdio: 'inherit' });
    success('npm 依赖安装完成');
  } catch {
    error('npm 依赖安装失败');
    warning('请手动运行: npm install');
  }

  // 第 5 步：初始化 Capacitor
  step('初始化 Capacitor...');
  try {
    // 检查是否已初始化
    if (!fs.existsSync('capacitor.config.ts')) {
      info('首次初始化，需要手动确认...');
      execSync('npx @capacitor/cli init', { stdio: 'inherit' });
    } else {
      success('Capacitor 已初始化');
    }
  } catch {
    warning('Capacitor 初始化可能需要手动完成');
  }

  // 第 6 步：构建 Web 应用
  step('构建 Web 应用...');
  try {
    execSync('npm run build:prod', { stdio: 'inherit' });
    success('Web 应用构建完成');
  } catch {
    error('Web 应用构建失败');
    process.exit(1);
  }

  // 第 7 步：添加 Android 平台
  step('添加 Android 平台...');
  try {
    if (!fs.existsSync('android')) {
      info('首次添加 Android 平台...');
      execSync('npx cap add android', { stdio: 'inherit' });
      success('Android 平台已添加');
    } else {
      success('Android 平台已存在');
      info('正在同步文件...');
      execSync('npx cap sync android', { stdio: 'inherit' });
    }
  } catch {
    error('添加 Android 平台失败');
    warning('请手动运行: npx cap add android');
  }

  // 第 8 步：权限配置
  step('配置 Android 权限...');
  try {
    const manifestPath = 'android/app/src/main/AndroidManifest.xml';
    if (fs.existsSync(manifestPath)) {
      const manifest = fs.readFileSync(manifestPath, 'utf8');
      
      const permissions = [
        'android.permission.BLUETOOTH',
        'android.permission.BLUETOOTH_ADMIN',
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
      ];

      let modified = false;
      for (const perm of permissions) {
        if (!manifest.includes(perm)) {
          info(`添加权限: ${perm}`);
          modified = true;
        }
      }

      if (modified) {
        warning('需要手动验证权限配置');
        info('请编辑: ' + manifestPath);
      } else {
        success('权限已配置');
      }
    }
  } catch {
    warning('权限配置检查失败，请手动配置');
  }

  // 总结
  step('迁移总结');
  log('\n✨ 迁移完成！下一步操作：\n', 'bright');
  
  const nextSteps = [
    '1. 验证应用配置:',
    '   - 检查 capacitor.config.ts 中的 appId 和 appName',
    '',
    '2. 配置 Android 权限:',
    '   - 编辑 android/app/src/main/AndroidManifest.xml',
    '   - 添加蓝牙和位置权限',
    '',
    '3. 测试应用:',
    '   npm run dev:android      # 运行到真机/模拟器',
    '   npm run build:prod       # 构建发布版本',
    '',
    '4. 生成签名密钥并打包:',
    '   npm run android:keystory # 创建签名密钥',
    '   npm run android:build    # 生成 APK',
    '',
    '5. 详细指南:',
    '   📖 CAPACITOR_MIGRATION_GUIDE.md',
    '   📖 SETUP_INSTRUCTIONS.md',
  ];

  for (const line of nextSteps) {
    info(line);
  }

  log('\n🎉 祝您开发愉快！\n', 'bright');
}

// 运行迁移
migrate().catch(err => {
  error('迁移过程出错:');
  console.error(err);
  process.exit(1);
});
