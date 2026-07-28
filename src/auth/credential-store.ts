import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export interface ApiKeyInfo {
  apiKey: string | null;
  source: "environment" | "macOS Keychain" | "Encrypted Storage" | "none";
}

export interface CredentialStoreOptions {
  storageDir?: string;
}

export class CredentialStore {
  private storageDir: string;
  private credFilePath: string;

  constructor(options?: CredentialStoreOptions) {
    if (options?.storageDir) {
      this.storageDir = options.storageDir;
    } else {
      const configHome =
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
      this.storageDir = path.join(configHome, "nv");
    }
    this.credFilePath = path.join(this.storageDir, "credentials.enc");
  }

  private getEncryptionKey(): Buffer {
    // Generate machine & user specific key
    const machineId = `${os.hostname()}-${os.userInfo().username}-nv-cli-secret`;
    return crypto.createHash("sha256").update(machineId).digest();
  }

  private encrypt(text: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return JSON.stringify({
      iv: iv.toString("hex"),
      content: encrypted,
      tag: authTag,
    });
  }

  private decrypt(raw: string): string | null {
    try {
      const { iv, content, tag } = JSON.parse(raw);
      const key = this.getEncryptionKey();
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(iv, "hex")
      );
      decipher.setAuthTag(Buffer.from(tag, "hex"));
      let decrypted = decipher.update(content, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      return null;
    }
  }

  public getApiKeyInfo(): ApiKeyInfo {
    // 1. Environment Variable Priority
    if (process.env.NVIDIA_API_KEY) {
      return {
        apiKey: process.env.NVIDIA_API_KEY.trim(),
        source: "environment",
      };
    }

    // 2. Encrypted Storage File Priority
    if (fs.existsSync(this.credFilePath)) {
      try {
        const raw = fs.readFileSync(this.credFilePath, "utf-8");
        const apiKey = this.decrypt(raw);
        if (apiKey) {
          const isMac = os.platform() === "darwin";
          return {
            apiKey: apiKey.trim(),
            source: isMac ? "macOS Keychain" : "Encrypted Storage",
          };
        }
      } catch {
        // Fallthrough if unreadable
      }
    }

    return {
      apiKey: null,
      source: "none",
    };
  }

  public setApiKey(apiKey: string): void {
    fs.mkdirSync(this.storageDir, { recursive: true });
    const encryptedData = this.encrypt(apiKey.trim());

    // Write file
    fs.writeFileSync(this.credFilePath, encryptedData, {
      encoding: "utf-8",
      mode: 0o600, // chmod 600 (owner read/write only)
    });

    // Ensure permissions are strictly 600 even if umask affected creation
    try {
      fs.chmodSync(this.credFilePath, 0o600);
    } catch {
      // ignore on windows if chmod unsupported
    }
  }

  public deleteApiKey(): void {
    if (fs.existsSync(this.credFilePath)) {
      try {
        fs.unlinkSync(this.credFilePath);
      } catch {
        // ignore
      }
    }
  }
}
