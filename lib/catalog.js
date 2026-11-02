'use strict';
// Curated model options shown in the Models screen. Download sizes and context windows are only filled in
// where the Ollama library page states them; otherwise they are null and the UI shows "see Ollama".
// Anything else can be pulled by typing an exact Ollama tag. Check each model's licence before deploying.
const G4 = 'Gemma 4', G3 = 'Gemma 3', OTH = 'Other open-weight';
const CATALOG = [
  { tag: 'gemma4:e2b', family: G4, params: 'edge (e2b)', ctx: '128K', input: ['text', 'image', 'audio'], sizeGB: null, license: null, note: 'Edge-class model. Smallest Gemma 4.' },
  { tag: 'gemma4:e4b', family: G4, params: 'edge (e4b)', ctx: '128K', input: ['text', 'image', 'audio'], sizeGB: null, license: null, note: 'Edge-class model with more headroom.' },
  { tag: 'gemma4:12b', family: G4, params: '12B', ctx: null, input: ['text', 'image'], sizeGB: 8.0, license: 'Apache-2.0', note: 'Workstation model. Good default when you have a 12 GB+ GPU.' },
  { tag: 'gemma4:26b', family: G4, params: '26B MoE (4B active)', ctx: '256K', input: ['text', 'image'], sizeGB: null, license: null, note: 'Mixture-of-experts: large model, small active compute.' },
  { tag: 'gemma4:31b', family: G4, params: '31B dense', ctx: '256K', input: ['text', 'image'], sizeGB: null, license: null, note: 'Largest dense Gemma 4. Needs a large GPU or multiple GPUs.' },
  { tag: 'gemma3:270m', family: G3, params: '270M', ctx: '32K', input: ['text'], sizeGB: 0.292, license: 'Gemma Terms of Use', note: 'Tiny. Useful for smoke tests and CPU-only machines.' },
  { tag: 'gemma3:1b', family: G3, params: '1B', ctx: '32K', input: ['text'], sizeGB: 0.806, license: 'Gemma Terms of Use', note: 'Text only. Runs on almost anything.' },
  { tag: 'gemma3:4b', family: G3, params: '4B', ctx: '128K', input: ['text', 'image'], sizeGB: 3.4, license: 'Gemma Terms of Use', note: 'Default. Balanced quality and speed on a single consumer GPU.', recommended: true },
  { tag: 'gemma3:12b', family: G3, params: '12B', ctx: '128K', input: ['text', 'image'], sizeGB: 8.2, license: 'Gemma Terms of Use', note: 'Stronger reasoning and drafting.' },
  { tag: 'gemma3:27b', family: G3, params: '27B', ctx: '128K', input: ['text', 'image'], sizeGB: 17, license: 'Gemma Terms of Use', note: 'Highest Gemma 3 quality. Needs 24 GB+ VRAM.' },
  { tag: 'gemma3:1b-it-qat', family: G3, params: '1B (QAT)', ctx: null, input: ['text'], sizeGB: null, license: 'Gemma Terms of Use', note: 'Quantization-aware trained build.' },
  { tag: 'gemma3:4b-it-qat', family: G3, params: '4B (QAT)', ctx: null, input: ['text', 'image'], sizeGB: null, license: 'Gemma Terms of Use', note: 'Quantization-aware trained build. Lower memory at similar quality.' },
  { tag: 'gemma3:12b-it-qat', family: G3, params: '12B (QAT)', ctx: null, input: ['text', 'image'], sizeGB: null, license: 'Gemma Terms of Use', note: 'Quantization-aware trained build.' },
  { tag: 'gemma3:27b-it-qat', family: G3, params: '27B (QAT)', ctx: null, input: ['text', 'image'], sizeGB: null, license: 'Gemma Terms of Use', note: 'Quantization-aware trained build.' },
  { tag: 'llama3.2:3b', family: OTH, params: '3B', ctx: null, input: ['text'], sizeGB: null, license: null, note: 'Meta Llama. Not verified in this build; check the Ollama page and licence.' },
  { tag: 'qwen3:8b', family: OTH, params: '8B', ctx: null, input: ['text'], sizeGB: null, license: null, note: 'Alibaba Qwen. Not verified in this build; check the Ollama page and licence.' },
  { tag: 'mistral:7b', family: OTH, params: '7B', ctx: null, input: ['text'], sizeGB: null, license: null, note: 'Mistral. Not verified in this build; check the Ollama page and licence.' },
];
const DEFAULT_MODEL = 'gemma3:4b';
const TAG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,100}$/;
module.exports = { CATALOG, DEFAULT_MODEL, TAG_RE };
