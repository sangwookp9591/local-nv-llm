import React from "react";
import { Box, Text } from "ink";
import { ChatMessage } from "../providers/provider.js";

interface ChatScreenProps {
  modelId: string;
  mode: "chat" | "agent";
  cwd: string;
  messages: ChatMessage[];
  streamingText: string;
  reasoningText: string;
  statusMessage?: string;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  modelId,
  mode,
  cwd,
  messages,
  streamingText,
  reasoningText,
  statusMessage,
}) => {
  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          NV — NVIDIA Terminal AI
        </Text>
        <Text dimColor>
          Model: {modelId} | Mode: {mode.toUpperCase()} | Directory: {cwd}
        </Text>
      </Box>

      <Box flexDirection="column" marginY={1}>
        {messages.map((msg, idx) => (
          <Box key={idx} flexDirection="column" marginY={1}>
            <Text bold color={msg.role === "user" ? "green" : "blue"}>
              {msg.role === "user" ? "› User" : "› NV"}
            </Text>
            <Text>{msg.content}</Text>
          </Box>
        ))}

        {reasoningText && (
          <Box flexDirection="column" marginY={1} paddingX={1} borderStyle="single" borderColor="magenta">
            <Text italic color="magenta">
              Thinking / Reasoning...
            </Text>
            <Text dimColor>{reasoningText}</Text>
          </Box>
        )}

        {streamingText && (
          <Box flexDirection="column" marginY={1}>
            <Text bold color="blue">
              › NV
            </Text>
            <Text>{streamingText}</Text>
          </Box>
        )}

        {statusMessage && (
          <Box marginY={1}>
            <Text color="yellow">⏳ {statusMessage}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
