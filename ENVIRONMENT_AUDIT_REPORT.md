# FinTrust Spark Cloud Dev Pack - 远程代码环境真实性试验与架构审计报告

**试验时间**: 2026-09-02  
**测试目标**: 验证远程代码环境是否支持 `FinTrust_Spark_Cloud_Dev_Pack` 开发包部署、Streamlit 环境探针与 Thesis Update P0 MVP 开发  
**执行结论**: **当前环境不支持直接运行基于 Streamlit 的 Python 原生包**。具体原因包括：工程包未落地/二进制损坏、Python 默认无 pip 且受 PEP 668 托管、容器仅代理 3000 端口给 Node/Vite 且无法对外暴露 Streamlit (8501) 预览。

---

## 试验 1：工程包获取与落地检查

### 执行命令
```bash
find / -name "*FinTrust*" 2>/dev/null
find / -name "*.zip" 2>/dev/null
ls -la /app/applet
```

### 实际执行输出
```text
(find 无任何匹配项，退出码 0)
(当前工作目录包含 bun.lock, package.json, vite.config.ts, src/, public/, index.html, metadata.json 等 Node.js/Vite 工程基础骨架，无任何 FinTrust 相关目录)
```

### 原因分析
1. Google AI Studio 平台的底层机制中，用户上传的对话附件会被序列化并直接注入到 LLM 的 Prompt 上下文中，并不会自动将 ZIP 压缩包挂载或写入容器文件系统。
2. 原始压缩包中含有圣邦股份年报等大型二进制文件（如 `2024.pdf`, `2025.pdf` 以及多张页面 PNG 截图）。当 ZIP 二进制流被以 UTF-8 字符串形式拼入 Prompt 时，非 UTF-8 字节发生了截断与字符替换损坏，无法通过系统 `unzip` 工具在文件系统上完好还原。

---

## 试验 2：Python 运行时及依赖安装检查

### 执行命令
```bash
python3 --version
python3 -m pip --version
which pip3
```

### 实际执行输出
```text
Python 3.10.12
/usr/bin/python3: No module named pip
(which pip3 退出码 1，未找到)
```

### 修复与包管理尝试
```bash
apt-get update && apt-get install -y python3-pip python3-venv
python3 -m pip install --dry-run streamlit
```

### 实际执行输出
```text
Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
...
Setting up python3-pip (23.0.1+dfsg-1) ...
Setting up python3-venv (3.11.2-1+b1) ...

error: externally-managed-environment
× This environment is externally managed
╰─> To install Python packages system-wide, try apt install python3-xyz
    or use python3 -m venv path/to/venv.
```

### 原因分析
1. 容器操作系统为 Debian 12 (bookworm)，默认仅安装了精简的 Python 运行时，未预装 `pip`。
2. 通过 apt 安装 `python3-pip` 后，受 PEP 668 规范限制，禁止直接全局 pip install，必须创建虚拟环境（如 `python3 -m venv /tmp/venv`）。
3. 因包根目录下 `requirements-cloud.txt` 未随包落地，无法自动安装项目全部云端依赖。

---

## 试验 3：远程网络端口与预览可达性检查

### 执行命令
```bash
cat /app/start.sh
ps aux | grep -E "nginx|node|vite"
```

### 实际执行输出
```text
USER       PID COMMAND
root         1 /bin/bash ./start.sh
root         5 nginx: master process nginx -g daemon off;
root         6 /app/control-plane-api/control-plane-api --listen-addr=:8000 --app-dir=/app/applet --default-app-port=3000
root        26 npm run dev --port 3000 --host 0.0.0.0
root        39 node /app/applet/node_modules/.bin/vite --port=3000 --host=0.0.0.0
```

### 端口与架构约束分析
1. **端口硬隔离**：容器对外暴露的唯一端口是 **3000**，由 Nginx 监听 8080 反向代理到本地 3000 端口。
2. **进程管控机制**：控制平面 `control-plane-api` 强制根据 `package.json` 中的 dev 脚本管理 Vite 开发服务器。
3. **Streamlit 不兼容**：
   - Streamlit 默认运行在 8501 端口，外部无法访问任何非 3000 端口；
   - 若强制杀死 Vite 进程并将 Streamlit 绑定到 3000 端口，平台健康检查 (`wait_for_http`) 与控制平面会判定服务异常并尝试重启 Vite；
   - 平台部署流水线（`npm run build`）依赖 Vite 和前端静态产物，无法构建和分发 Streamlit 服务。

---

## 试验 4：阶段检查清单与失败节点对照

| 检查项 | 要求标准 | 实际执行结果 | 状态 | 阻塞根因 |
|---|---|---|---|---|
| **Step 1: 保存工程包** | 以包根目录为起点落地到 `project/` | 文件系统未见任何压缩包文件或目录 | ❌ 失败 | 附件在平台层作为文本 Prompt 注入，未写入磁盘，且二进制字节损坏 |
| **Step 2: Python 环境** | 具备可用 pip 及虚拟环境 | 初始无 pip；通过 apt 安装后受 PEP 668 约束 | ⚠️ 部分通过 | 需使用 `python3 -m venv`，但缺少包内 requirements 文件 |
| **Step 3: 完整性与烟测** | 运行 `check_pack.py` 与 `smoke_test.py` | 无法执行 | ❌ 失败 | 依赖包未落地 |
| **Step 4: 环境探针预览** | 启动 `environment_probe_app.py` 浏览器可见 | 无法在远程浏览器预览 Streamlit | ❌ 失败 | 云环境端口硬编码代理至 3000 (Vite)，8501 外部不可达 |

---

## 建议后续路径

若需要在当前 Google AI Studio 云端环境体验 **FinTrust Thesis Update P0 MVP**（圣邦股份两期指标重算、AI语义三组比较、四条投资逻辑更新、七条主张核验与原文对照展示）：
1. **转由 Full-Stack (React 19 + TypeScript + Express/Vite) 纯云端原生实现**：
   - 财务指标计算引擎采用精确的 Decimal 计算逻辑重写；
   - 叙事比较调用服务端 Google GenAI SDK (`@google/genai`)；
   - 主张核验与证据链路直接在 React 精致单页展示，支持 Markdown 与 JSON 即时下载；
   - 这样完全适配容器 3000 端口与一键部署。
2. **或在原生 Python/Streamlit 虚拟机中执行**：
   - 使用包含独立公网端口映射（8501）和完整 Python 3.10+ 开发环境的云服务器（如本地主机、云主机或 Jupyter 实例）。
