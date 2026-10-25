import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

/** Opens a native dialog on the machine running the backend. */
export async function pickLocalFolder(): Promise<string | null> {
  let program: string;
  let args: string[];
  if (process.platform === 'win32') {
    program = 'powershell.exe';
    args = ['-NoProfile', '-Sta', '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Choose a folder for this chat'; $d.ShowNewFolderButton = $false; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }"];
  } else if (process.platform === 'darwin') {
    program = 'osascript';
    args = ['-e', 'POSIX path of (choose folder with prompt "Choose a folder for this chat")'];
  } else {
    program = 'zenity';
    args = ['--file-selection', '--directory', '--title=Choose a folder for this chat'];
  }
  try {
    const { stdout } = await run(program, args, { windowsHide: true, timeout: 120_000, maxBuffer: 4096 });
    return stdout.trim() || null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new Error('No folder picker is available on the server. Enter a folder path instead.');
    return null;
  }
}
