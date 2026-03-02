# 🚀 GitHub Actions 自动构建 APK 指南

## 📋 简介

使用 GitHub Actions，您可以在GitHub云服务器上自动构建 Android APK，无需在本地配置 Android SDK 和复杂的开发环境。

**优势：**
- ✅ 无需本地 Android SDK
- ✅ 自动构建和签名
- ✅ 生成的 APK 可直接下载
- ✅ 支持自动发布到 GitHub Releases
- ✅ 完全免费（GitHub 提供 3000 分钟/月）

---

## ⚡ 快速开始（3步）

### 1️⃣ 生成签名密钥（本地一次性操作）

```bash
# 在本地生成签名密钥
keytool -genkey -v -keystore release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias ab_mate_key

# 输入时需要记住：
# - 密钥库密码 (例如: MyPassword123)
# - 密钥密码 (例如: MyPassword123)
# - 别名: ab_mate_key
```

### 2️⃣ 将密钥转换为 Base64

```bash
# Windows PowerShell
$content = [System.IO.File]::ReadAllBytes('release.keystore')
$base64 = [System.Convert]::ToBase64String($content)
Set-Clipboard -Value $base64
# 现在可以直接粘贴

# 或保存到文件
$base64 | Out-File keystore.txt
```

```bash
# Linux/macOS
base64 -i release.keystore | pbcopy  # macOS (复制到剪贴板)
base64 -i release.keystore > keystore.txt  # Linux (保存到文件)
```

### 3️⃣ 配置 GitHub Secrets

1. **打开您的 GitHub 仓库**
2. **进入 Settings（设置）**
3. **选择 Secrets and variables → Actions**
4. **点击 "New repository secret"，添加以下4个密钥：**

| 密钥名称 | 值 |
|---------|-----|
| `ANDROID_KEYSTORE_BASE64` | 上面复制的 Base64 密钥内容 |
| `ANDROID_KEYSTORE_PASSWORD` | 密钥库密码（例如：MyPassword123） |
| `ANDROID_KEY_ALIAS` | ab_mate_key |
| `ANDROID_KEY_PASSWORD` | 密钥密码（与密钥库密码相同） |

**例如：**
```
密钥名: ANDROID_KEYSTORE_BASE64
值: MIIKKAIBAzCCCfwGCSqGSIb3DQEBBQUAMIIJvwIBAzCCCbcGCSqGSIb3DQEBBQUAMIIJpwIBAzCC...
```

---

## 🎯 工作流说明

### 工作流文件位置
```
.github/workflows/build-apk.yml
```

### 触发条件

| 事件 | 构建类型 | 说明 |
|------|---------|------|
| **Push to main** | Release | 构建并签名最终 APK，上传到 Release |
| **Push to develop** | Debug | 构建无签名 APK，用于测试 |
| **Pull Request** | Debug | 验证代码不破坏构建 |
| **Manual Dispatch** | Debug | 手动从 GitHub UI 触发 |

### 构建步骤

1. 配置 Node.js 18
2. 配置 Java 17
3. 安装 npm 依赖
4. 构建 Web 应用（React）
5. 同步 Capacitor 配置
6. 设置签名密钥（仅 Release）
7. 构建 APK（Debug 或 Release）
8. 上传构建产物为 Artifacts
9. 发布到 GitHub Releases（仅 main 分支）

---

## 📥 下载 APK

### 从 GitHub Actions Artifacts 下载

1. **打开您的仓库**
2. **点击 "Actions" 标签**
3. **选择最新的构建工作流**
4. **在下方的 "Artifacts" 部分下载：**
   - `APK-Debug` - 调试版本（用于开发）
   - `APK-Release` - 发布版本（用于应用商店）

**Artifacts 保留期：**
- Debug: 7 天
- Release: 30 天

### 从 GitHub Releases 下载

如果推送到 main 分支，APK 会自动发布到 Releases：

1. **打开您的仓库**
2. **在右侧看到 "Releases"**
3. **点击最新的 Release**
4. **下载 `app-release.apk`**

---

## 🔄 构建流程示例

### 开发流程

```bash
# 1. 在 develop 分支开发
git checkout develop
git add .
git commit -m "Add new features"

# 2. Push 到 GitHub
git push origin develop

# 3. GitHub Actions 自动构建 Debug APK
# ↓ 在 Actions 中查看进度
# ↓ 下载 Artifacts 中的 APK-Debug

# 4. 在真机上测试
adb install APK-Debug/app-debug.apk
```

### 发布流程

```bash
# 1. 合并到 main 分支
git checkout main
git merge develop
git push origin main

# 2. GitHub Actions 自动构建并签名 Release APK
# ↓ 发布到 GitHub Releases
# ↓ 或者从 Artifacts 中下载 APK-Release

# 3. 上传到应用商店
# - Google Play Store
# - 其他应用商店
```

---

## ⚙️ 自定义配置

### 修改触发分支

编辑 `.github/workflows/build-apk.yml`：

```yaml
on:
  push:
    branches: [ main, master, dev ]  # 修改分支名
  pull_request:
    branches: [ main, master, dev ]
```

### 修改 Java 版本

如果需要不同的 Java 版本（默认是 17）：

```yaml
- name: 🔧 设置 Java
  uses: actions/setup-java@v4
  with:
    distribution: 'temurin'
    java-version: '11'  # 改为 11、17、21 等
```

### 修改 APK 输出文件名

编辑 `android/app/build.gradle`：

```gradle
android {
    defaultConfig {
        applicationId "com.abmate.app"
        versionCode 1
        versionName "1.0.0"
    }
}
```

每次更新版本后：
- `versionCode` 必须递增（每次发布增加1）
- `versionName` 遵循语义化版本（MAJOR.MINOR.PATCH）

---

## 🐛 故障排除

### 问题 1：构建失败，提示找不到 Gradle

**解决：** 工作流会自动下载，确保 `android/gradlew` 有执行权限：

```bash
git add android/gradlew
git update-index --chmod=+x android/gradlew
git commit -m "Fix gradlew permissions"
```

### 问题 2：签名失败

**检查清单：**
- [ ] `ANDROID_KEYSTORE_BASE64` 不能有空格或换行
- [ ] 三个密码都输入正确
- [ ] 确保推送到 `main` 分支才触发 Release 构建

**重新设置 Secret：**

```bash
# 重新生成 Base64，确保没有换行
base64 -w 0 release.keystore > keystore.txt

# 在 GitHub Secrets 中更新，确保一行完整
```

### 问题 3：APK 过大或构建缓慢

**优化方案：**

在 `android/app/build.gradle` 中启用混淆：

```gradle
android {
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 问题 4：找不到下载链接

**检查步骤：**
1. 确保工作流已成功运行（无红色 ✗）
2. 向下滚动到 "Artifacts" 部分
3. 如果没有，检查 GitHub Actions 日志

---

## 📊 构建时间

| 操作 | 耗时 |
|------|------|
| 初次构建 | 8-10 分钟 |
| 后续构建（缓存） | 4-6 分钟 |
| 自动上传到 Release | 1-2 分钟 |

---

## 🔐 安全性

### 密钥安全最佳实践

✅ **正确做法：**
- 使用 GitHub Secrets 存储敏感信息
- Secrets 在日志中自动被掩码
- 不要将密钥提交到 Git 仓库

❌ **错误做法：**
- 将 `release.keystore` 提交到 Git
- 在 YAML 文件中硬编码密码
- 将 Secrets 值粘贴到任何可见的地方

### 密钥轮换

如果泄露了密钥：

1. 生成新的密钥
2. 在 GitHub Secrets 中更新
3. 通知所有贡献者

---

## 📱 应用商店上架

生成的 `app-release.apk` 可直接上架：

### Google Play Store

1. 创建开发者账户（$25 一次性费用）
2. 上传 `app-release.apk`
3. 填写应用信息
4. 提交审核

### 其他应用商店

- 华为应用市场
- 小米应用商店
- OPPO 应用商店
- vivo 应用商店
- 等等

---

## ✨ 高级特性

### 自动创建 GitHub Release

已配置自动发布到 Release（推送到 main 时）：

```yaml
- name: 📤 上传到 GitHub Release
  uses: softprops/action-gh-release@v1
  with:
    files: android/app/build/outputs/apk/release/app-release.apk
    draft: true  # 标记为草稿，手动发布
```

### 自动标签和版本

如果需要自动标记版本，可以添加：

```yaml
- name: 🏷️ 创建版本标签
  run: |
    git config user.name "GitHub Actions"
    git config user.email "actions@github.com"
    git tag v1.0.0
    git push origin v1.0.0
```

---

## 📚 完整工作流脚本

完整的 `.github/workflows/build-apk.yml` 已包含在项目中。

---

## 🚀 现在就开始！

1. **确认已提交所有代码到 GitHub**
   ```bash
   git remote -v  # 检查远程仓库
   git push origin main
   ```

2. **在 GitHub 仓库设置 Secrets**（参考上面的步骤）

3. **推送代码触发构建**
   ```bash
   git add .
   git commit -m "Enable GitHub Actions"
   git push origin develop
   ```

4. **等待构建完成**（4-10 分钟）

5. **下载 APK**
   - 从 Actions Artifacts
   - 或从 Releases（仅 main 分支）

---

## 📞 获取帮助

如果构建失败，检查：

1. **GitHub Actions 日志**（红色 ✗ 部分）
2. **Secrets 配置**（确保没有特殊字符）
3. **分支名称**（确保与工作流配置匹配）
4. **文件权限**（确保 `gradlew` 可执行）

---

**现在您可以完全依赖 GitHub 来构建 APK 了！** 🎉

不需要任何本地配置，推送代码 → 自动构建 → 下载 APK！

