const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow: BrowserWindow | null;

const isDev = process.env.NODE_ENV === 'development';

// 监听预加载脚本的日志
ipcMain.on('preload:log', (_event: any, message: string) => {
  console.log(message);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      // 启用 Web Bluetooth API
      enableBlinkFeatures: 'WebBluetooth',
    },
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../renderer/index.html')}`;

  mainWindow.loadURL(startUrl);
  
  console.log('[主进程] 加载 URL:', startUrl);

  // 总是打开开发者工具
  mainWindow.webContents.openDevTools();

  // 处理蓝牙设备选择请求
  mainWindow.webContents.session.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    
    console.log('[主进程] 蓝牙设备列表:', deviceList);
    
    // 如果有设备，选择第一个
    if (deviceList.length > 0) {
      callback(deviceList[0].deviceId);
    } else {
      callback('');
    }
  });

  // 处理蓝牙配对请求
  mainWindow.webContents.session.setBluetoothPairingHandler((details, callback) => {
    console.log('[主进程] 蓝牙配对请求:', details);
    
    // 自动确认配对
    if (details.pairingKind === 'confirm') {
      callback({ confirmed: true });
    } else if (details.pairingKind === 'confirmPin') {
      callback({ confirmed: true, pin: details.pin });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// 创建菜单
const template = [
  {
    label: '文件',
    submenu: [
      {
        label: '退出',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  },
  {
    label: '编辑',
    submenu: [
      { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
      { label: '重做', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
      { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
