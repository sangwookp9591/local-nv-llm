import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { CredentialStore } from "../auth/credential-store.js";
import { NvidiaProvider } from "../providers/nvidia/client.js";
import { ConfigStore } from "../config/config-store.js";
import { maskApiKey } from "../auth/redaction.js";

const execAsync = promisify(exec);

export interface DoctorCheckItem {
  status: "ok" | "warn" | "error";
  label: string;
  message?: string;
}

export interface DoctorReport {
  nodeVersion: string;
  cwdWritable: boolean;
  items: DoctorCheckItem[];
}

export async function runDoctorCheck(cwd: string = process.cwd()): Promise<DoctorReport> {
  const items: DoctorCheckItem[] = [];

  // 1. Node.js version
  const nodeVer = process.version;
  const major = parseInt(nodeVer.replace("v", "").split(".")[0], 10);
  if (major >= 22) {
    items.push({ status: "ok", label: `Node.js ${nodeVer}` });
  } else {
    items.push({
      status: "warn",
      label: `Node.js ${nodeVer}`,
      message: "Node.js 22 이상이 권장됩니다.",
    });
  }

  // 2. Cwd Writable
  let cwdWritable = false;
  try {
    const testFile = path.join(cwd, `.nv-test-${Date.now()}`);
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    cwdWritable = true;
    items.push({ status: "ok", label: "Current directory is writable" });
  } catch {
    items.push({
      status: "error",
      label: "Current directory permission",
      message: "현재 디렉터리에 쓰기 권한이 없습니다.",
    });
  }

  // 3. Git check
  try {
    const { stdout } = await execAsync("git --version");
    items.push({ status: "ok", label: stdout.trim() });
  } catch {
    items.push({
      status: "warn",
      label: "Git installation",
      message: "Git이 설치되어 있지 않거나 PATH에 없습니다.",
    });
  }

  // 4. API Key check
  const credStore = new CredentialStore();
  const apiKeyInfo = credStore.getApiKeyInfo();

  if (apiKeyInfo.apiKey) {
    const masked = maskApiKey(apiKeyInfo.apiKey);
    items.push({
      status: "ok",
      label: `NVIDIA API Key configured (${apiKeyInfo.source})`,
      message: `Key: ${masked}`,
    });

    // Test API connection
    try {
      const provider = new NvidiaProvider();
      const isValid = await provider.validateCredential(apiKeyInfo.apiKey);
      if (isValid) {
        items.push({ status: "ok", label: "NVIDIA API authentication succeeded" });
      } else {
        items.push({
          status: "error",
          label: "NVIDIA API authentication failed",
          message: "API Key가 거부되었습니다. 'nv auth login'으로 재설정하세요.",
        });
      }
    } catch (err: unknown) {
      items.push({
        status: "warn",
        label: "NVIDIA API connection warning",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    items.push({
      status: "warn",
      label: "NVIDIA API Key not configured",
      message: "'nv auth login' 또는 NVIDIA_API_KEY 환경 변수를 설정하세요.",
    });
  }

  return {
    nodeVersion: nodeVer,
    cwdWritable,
    items,
  };
}
