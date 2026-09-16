// Threads GIF 下載器 啟動程式
// 啟動 node server.js（隱藏視窗），常駐在系統列；從系統列圖示開介面或結束。
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

class TrayApp : ApplicationContext
{
    const int PORT = 5123;
    static readonly string URL = "http://127.0.0.1:" + PORT;

    NotifyIcon tray;
    Process server;
    string downloadDir;

    static string FindNode(string appDir)
    {
        string bundled = Path.Combine(appDir, "runtime", "node.exe");   // 可攜版附帶的 node
        if (File.Exists(bundled)) return bundled;
        string pf = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        if (File.Exists(pf)) return pf;
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in path.Split(';'))
        {
            if (dir.Length == 0) continue;
            try
            {
                string c = Path.Combine(dir.Trim(), "node.exe");
                if (File.Exists(c)) return c;
            }
            catch { }
        }
        return null;
    }

    static void Fail(string msg)
    {
        MessageBox.Show(msg, "Threads GIF 下載器", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    public TrayApp()
    {
        string exeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        string appDir = Path.Combine(exeDir, "app");
        string serverJs = Path.Combine(appDir, "server.js");
        if (!File.Exists(serverJs)) { appDir = exeDir; serverJs = Path.Combine(appDir, "server.js"); }
        if (!File.Exists(serverJs))
        {
            Fail("找不到 server.js。\n請確認 app 資料夾和這個程式放在一起。");
            ExitThread(); return;
        }

        string node = FindNode(appDir);
        if (node == null)
        {
            Fail("找不到 Node.js。\n\n請先到 https://nodejs.org 下載安裝（選 LTS 版），\n裝完再開這個程式一次。");
            ExitThread(); return;
        }

        downloadDir = Path.Combine(exeDir, "downloads");

        var psi = new ProcessStartInfo(node, "\"" + serverJs + "\"");
        psi.WorkingDirectory = appDir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardError = true;
        psi.RedirectStandardOutput = true;
        psi.EnvironmentVariables["PARENT_PID"] =
            Process.GetCurrentProcess().Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
        psi.EnvironmentVariables["DOWNLOAD_DIR"] = downloadDir;
        string browsers = Path.Combine(exeDir, "ms-playwright");
        if (Directory.Exists(browsers)) psi.EnvironmentVariables["PLAYWRIGHT_BROWSERS_PATH"] = browsers;

        try { server = Process.Start(psi); }
        catch (Exception ex) { Fail("啟動失敗：\n" + ex.Message); ExitThread(); return; }

        var err = new System.Text.StringBuilder();
        server.ErrorDataReceived += (s, e) => { if (e.Data != null) err.AppendLine(e.Data); };
        server.OutputDataReceived += (s, e) => { };
        server.BeginErrorReadLine();
        server.BeginOutputReadLine();

        // 伺服器若馬上掛掉（例如連接埠被占用），把原因顯示出來
        if (server.WaitForExit(2500))
        {
            string msg = err.ToString().Trim();
            Fail(msg.Length > 0 ? msg : "伺服器沒有啟動成功。");
            ExitThread(); return;
        }
        // 伺服器自己結束時（例如被工作管理員關掉），托盤圖示也跟著收掉
        var watch = new Timer();
        watch.Interval = 2000;
        watch.Tick += (s, e) => { try { if (server.HasExited) { watch.Stop(); Quit(); } } catch { } };
        watch.Start();

        var menu = new ContextMenuStrip();
        menu.Items.Add("開啟下載器介面", null, (s, e) => OpenUI());
        menu.Items.Add("開啟下載資料夾", null, (s, e) => OpenFolder());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("結束下載器", null, (s, e) => Quit());

        tray = new NotifyIcon();
        tray.Icon = SystemIcons.Application;
        tray.Text = "Threads GIF 下載器（執行中）";
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += (s, e) => OpenUI();
        tray.Visible = true;
        tray.BalloonTipTitle = "Threads GIF 下載器";
        tray.BalloonTipText = "已啟動，瀏覽器會自動開啟。\n要關掉請在右下角圖示按右鍵 → 結束下載器。";
        tray.ShowBalloonTip(6000);
    }

    void OpenUI()
    {
        try { Process.Start(new ProcessStartInfo(URL) { UseShellExecute = true }); } catch { }
    }

    void OpenFolder()
    {
        try
        {
            Directory.CreateDirectory(downloadDir);
            Process.Start("explorer.exe", "\"" + downloadDir + "\"");
        }
        catch { }
    }

    void Quit()
    {
        if (tray != null) { tray.Visible = false; tray.Dispose(); tray = null; }
        try { if (server != null && !server.HasExited) server.Kill(); } catch { }
        ExitThread();
    }
}

class Launcher
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.Run(new TrayApp());
    }
}
