/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ImagePromptInputs {
  articleTitle: string;
  materialColor: string;
  overlayText: string;
  aspectRatio: string;
}

export interface GeneratedImage {
  url: string;
  webpUrl?: string;
  prompt: string;
  timestamp: number;
}
