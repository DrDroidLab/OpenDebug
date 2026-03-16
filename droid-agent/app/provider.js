import OpenAI, { AzureOpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const PROVIDER = (process.env.AI_PROVIDER || 'azure-openai').toLowerCase();

let client = null;
let providerName = '';
let modelId = '';

// ── Initialize client based on provider ──

switch (PROVIDER) {
  case 'openai': {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    modelId = process.env.OPENAI_MODEL || 'gpt-4.1';
    providerName = 'OpenAI';
    break;
  }

  case 'claude': {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    modelId = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
    providerName = 'Anthropic';
    break;
  }

  case 'azure-openai': {
    client = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: process.env.AZURE_API_VERSION || '2025-04-01-preview',
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'openai-5.2'
    });
    modelId = process.env.AZURE_OPENAI_DEPLOYMENT || 'openai-5.2';
    providerName = 'Azure AI Foundry (OpenAI)';
    break;
  }

  case 'azure-kimi': {
    client = new AzureOpenAI({
      apiKey: process.env.AZURE_KIMI_API_KEY,
      endpoint: process.env.AZURE_KIMI_ENDPOINT,
      apiVersion: process.env.AZURE_API_VERSION || '2025-04-01-preview',
      deployment: process.env.AZURE_KIMI_DEPLOYMENT || 'kimi-k2'
    });
    modelId = process.env.AZURE_KIMI_DEPLOYMENT || 'kimi-k2';
    providerName = 'Azure AI Foundry (Kimi)';
    break;
  }

  default:
    throw new Error(`Unknown AI_PROVIDER: "${PROVIDER}". Use: openai, claude, azure-openai, azure-kimi`);
}

console.log(`[provider] Initialized: ${providerName} / ${modelId}`);

// ── Unified completion call ──

export async function createCompletion({ system, messages, maxTokens = 4096 }) {
  const msgCount = messages.length;
  const systemLen = system.length;
  console.log(`[llm] Calling ${providerName} model=${modelId} messages=${msgCount} systemLen=${systemLen}`);
  const start = Date.now();

  let text;
  try {
    if (PROVIDER === 'claude') {
      text = await callClaude({ system, messages, maxTokens });
    } else {
      text = await callOpenAICompatible({ system, messages, maxTokens });
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`[llm] ERROR after ${elapsed}ms: ${err.message}`);
    throw err;
  }

  const elapsed = Date.now() - start;
  console.log(`[llm] Response received in ${elapsed}ms, length=${text.length} chars`);
  return text;
}

// ── OpenAI-compatible providers (openai, azure-openai, azure-kimi) ──

async function callOpenAICompatible({ system, messages, maxTokens }) {
  const params = {
    model: modelId,
    messages: [
      { role: 'system', content: system },
      ...messages
    ]
  };

  if (useMaxCompletionTokens()) {
    params.max_completion_tokens = maxTokens;
  } else {
    params.max_tokens = maxTokens;
  }

  const response = await client.chat.completions.create(params);

  // Log usage if available
  if (response.usage) {
    console.log(`[llm] Tokens: prompt=${response.usage.prompt_tokens} completion=${response.usage.completion_tokens} total=${response.usage.total_tokens}`);
  }

  return response.choices[0]?.message?.content || '';
}

function useMaxCompletionTokens() {
  if (PROVIDER === 'azure-openai' || PROVIDER === 'azure-kimi') return true;
  if (/^(o[1-9]|gpt-5|gpt-4\.1)/.test(modelId)) return true;
  return false;
}

// ── Anthropic Claude ──

async function callClaude({ system, messages, maxTokens }) {
  const anthropicMessages = messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }
    if (Array.isArray(msg.content)) {
      const content = msg.content.map(part => {
        if (part.type === 'image_url') {
          const dataMatch = part.image_url.url.match(/^data:(.*?);base64,(.*)$/);
          if (dataMatch) {
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: dataMatch[1],
                data: dataMatch[2]
              }
            };
          }
        }
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        }
        return part;
      });
      return { role: msg.role, content };
    }
    return { role: msg.role, content: msg.content };
  });

  const response = await client.messages.create({
    model: modelId,
    max_tokens: maxTokens,
    system,
    messages: anthropicMessages
  });

  // Log usage
  if (response.usage) {
    console.log(`[llm] Tokens: input=${response.usage.input_tokens} output=${response.usage.output_tokens}`);
  }

  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}

// ── Image content builder ──

export function buildImageContent(message, images) {
  if (!images || images.length === 0) {
    return message;
  }
  const content = [];
  for (const img of images) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${img.mediaType};base64,${img.base64}`
      }
    });
  }
  content.push({ type: 'text', text: message });
  return content;
}

// ── Info getters ──

export function getProviderName() {
  return providerName;
}

export function getModelId() {
  return modelId;
}
