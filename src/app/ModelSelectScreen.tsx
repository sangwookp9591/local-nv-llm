import React from "react";
import { Box, Text } from "ink";
import { ModelCapability } from "../providers/provider.js";

interface ModelSelectScreenProps {
  models: ModelCapability[];
  selectedIndex: number;
  searchQuery: string;
  onSelect: (model: ModelCapability) => void;
}

export const ModelSelectScreen: React.FC<ModelSelectScreenProps> = ({
  models,
  selectedIndex,
  searchQuery,
}) => {
  const currentModel = models[selectedIndex];

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Select NVIDIA Model
      </Text>
      {searchQuery ? (
        <Text dimColor>Search: {searchQuery}</Text>
      ) : (
        <Text dimColor>Type to search models...</Text>
      )}
      <Box flexDirection="column" marginY={1}>
        {models.map((model, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={model.id}>
              <Text color={isSelected ? "green" : "white"} bold={isSelected}>
                {isSelected ? "❯ " : "  "}
                {model.id}
              </Text>
            </Box>
          );
        })}
      </Box>

      {currentModel && (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
          <Text bold color="yellow">
            {currentModel.name || currentModel.id}
          </Text>
          <Text>
            Capability:{" "}
            {[
              currentModel.coding ? "Coding" : null,
              currentModel.reasoning ? "Reasoning" : null,
              currentModel.toolCalling ? "Tool Use" : null,
              currentModel.vision ? "Vision" : null,
            ]
              .filter(Boolean)
              .join(" / ") || "Chat"}
          </Text>
          <Text dimColor>
            Streaming: {currentModel.streaming ? "Supported" : "Unsupported"} | Tool Calling:{" "}
            {currentModel.toolCalling ? "Supported" : "Unsupported"}
          </Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>↑↓ 이동 | Enter 선택 | Esc 취소</Text>
      </Box>
    </Box>
  );
};
