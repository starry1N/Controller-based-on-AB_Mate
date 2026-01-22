/**
 * AB-Mate 蓝牙诊断工具
 * 在 Console 中运行以诊断连接问题
 */

window.ABMateDiagnostics = {
  /**
   * 获取所有日志信息
   */
  getLogs() {
    console.clear();
    console.log('%c=== AB-Mate 蓝牙诊断工具 ===', 'font-weight: bold; font-size: 14px; color: #667eea');
    console.log('');
    console.log('%c📋 检查清单:', 'font-weight: bold; color: #667eea');
    
    const checks = [
      ['✓ BLE 支持', navigator.bluetooth ? '支持' : '不支持'],
      ['✓ 蓝牙可用', navigator.bluetooth && 'requestDevice' in navigator.bluetooth ? '可用' : '不可用'],
    ];
    
    checks.forEach(([name, status]) => {
      const statusColor = status === '支持' || status === '可用' ? '#10b981' : '#ef4444';
      console.log(`  ${name}: %c${status}`, `color: ${statusColor}`);
    });
    
    console.log('');
    console.log('%c🔄 执行诊断:', 'font-weight: bold; color: #667eea');
    console.log('  1. 打开 F12 → Console');
    console.log('  2. 点击"连接设备"');
    console.log('  3. 在下方查看日志');
    console.log('');
  },

  /**
   * 监听所有日志
   */
  startMonitoring() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const logs = [];

    console.log = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logs.push({ type: 'log', message, timestamp: new Date() });
      originalLog.apply(console, args);
    };

    console.error = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logs.push({ type: 'error', message, timestamp: new Date() });
      originalError.apply(console, args);
    };

    console.warn = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logs.push({ type: 'warn', message, timestamp: new Date() });
      originalWarn.apply(console, args);
    };

    window.ABMateLogs = logs;
    console.log('%c✅ 诊断监听已启动', 'color: #10b981; font-weight: bold');
  },

  /**
   * 保存诊断日志到文件
   */
  exportLogs() {
    const logs = window.ABMateLogs || [];
    const content = logs.map(log => 
      `[${log.timestamp.toLocaleTimeString()}] [${log.type.toUpperCase()}] ${log.message}`
    ).join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ab-mate-diagnosis-${new Date().toISOString()}.txt`;
    a.click();
    
    console.log('%c✅ 诊断日志已导出', 'color: #10b981; font-weight: bold');
  },

  /**
   * 快速诊断报告
   */
  generateReport() {
    console.clear();
    console.log('%c=== AB-Mate 诊断报告 ===', 'font-weight: bold; font-size: 14px; color: #667eea');
    console.log('');

    const logs = window.ABMateLogs || [];
    
    // 分析连接阶段
    const connectionLogs = logs.filter(l => 
      l.message.includes('发现设备') ||
      l.message.includes('连接') ||
      l.message.includes('GATT') ||
      l.message.includes('特征')
    );

    // 分析发送阶段
    const sendLogs = logs.filter(l => l.message.includes('📤'));

    // 分析接收阶段
    const recvLogs = logs.filter(l => l.message.includes('📥'));

    // 分析错误
    const errorLogs = logs.filter(l => l.type === 'error' || l.message.includes('❌'));

    console.log('%c📍 连接阶段:', 'font-weight: bold; color: #667eea');
    connectionLogs.forEach(l => console.log(`  ${l.message}`));
    
    console.log('');
    console.log('%c📤 发送阶段:', 'font-weight: bold; color: #667eea');
    console.log(`  总计: ${sendLogs.length} 个数据包`);
    sendLogs.slice(-3).forEach(l => console.log(`  ${l.message}`));

    console.log('');
    console.log('%c📥 接收阶段:', 'font-weight: bold; color: #667eea');
    console.log(`  总计: ${recvLogs.length} 个响应`);
    recvLogs.slice(-3).forEach(l => console.log(`  ${l.message}`));

    if (errorLogs.length > 0) {
      console.log('');
      console.log('%c⚠️  错误信息:', 'font-weight: bold; color: #ef4444');
      errorLogs.forEach(l => console.log(`  ${l.message}`));
    }

    console.log('');
    console.log('%c诊断总结:', 'font-weight: bold; color: #667eea');
    if (connectionLogs.length > 0 && sendLogs.length > 0) {
      if (recvLogs.length > 0) {
        console.log('  ✅ 连接正常，数据收发正常');
      } else {
        console.log('  ⚠️  已连接并发送命令，但未收到响应');
        console.log('  可能原因:');
        console.log('    1. Notify 特征未正确订阅');
        console.log('    2. 设备未启用 AB-Mate 框架 (AB_MATE_APP_EN != 1)');
        console.log('    3. 设备处于特殊模式 (DFU/OTA)');
      }
    } else {
      console.log('  ❌ 连接失败，检查设备是否在线');
    }
  },

  /**
   * 清除所有诊断数据
   */
  reset() {
    window.ABMateLogs = [];
    console.clear();
    console.log('%c✅ 诊断数据已清除', 'color: #10b981; font-weight: bold');
  }
};

// 自动启动诊断
console.log('%c🔧 AB-Mate 诊断工具已加载', 'color: #10b981; font-weight: bold');
console.log('使用方法:');
console.log('  ABMateDiagnostics.getLogs()      // 显示诊断清单');
console.log('  ABMateDiagnostics.startMonitoring() // 启动诊断监听');
console.log('  ABMateDiagnostics.generateReport()  // 生成诊断报告');
console.log('  ABMateDiagnostics.exportLogs()   // 导出诊断日志');
console.log('  ABMateDiagnostics.reset()        // 重置诊断数据');
