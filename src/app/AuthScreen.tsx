import React, { useState } from "react";
import { Box, Text } from "ink";
import { CredentialStore } from "../auth/credential-store.js";
import { NvidiaProvider } from "../providers/nvidia/client.js";

interface AuthScreenProps {
  onSuccess: (apiKey: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Ink basic key listener simulation/input handling
  return (
    <Box flexDirection="column" padding={1} borderWidth={1} borderColor="blue">
      <Text bold color="cyan">
        NV — NVIDIA Terminal AI
      </Text>
      <Box marginY={1}>
        <Text color="yellow">NVIDIA API Key가 설정되어 있지 않습니다.</Text>
      </Box>
      <Text dimColor>API Key는 https://build.nvidia.com 에서 발급받을 수 있습니다.</Text>
      <Box marginTop={1}>
        <Text bold>API Key 입력 (NVIDIA_API_KEY): </Text>
        <Text color="green">{"•".repeat(apiKeyInput.length)}</Text>
      </Box>

      {status === "verifying" && (
        <Box marginTop={1}>
          <Text color="cyan">✓ NVIDIA API Key 유효성을 검증하는 중...</Text>
        </Box>
      )}

      {status === "error" && (
        <Box marginTop={1}>
          <Text color="red">✗ {errorMsg}</Text>
        </Box>
      )}
    </Box>
  );
};
