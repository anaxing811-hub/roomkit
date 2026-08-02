/**
 * The optional Claude backend for auto-organisation.
 *
 * This is the ONLY module in the app that touches the network, and it is
 * dynamically imported from organizer.js so it never loads -- and the SDK never
 * enters the main bundle -- unless the user has explicitly turned it on and
 * supplied a key.
 *
 * Model: claude-sonnet-5 at high effort, as requested. Notes on the request
 * shape, since Sonnet 5 differs from earlier models:
 *   - Adaptive thinking is ON by default; `max_tokens` caps thinking AND text
 *     together, so it's sized generously rather than trimmed to the answer.
 *   - `budget_tokens` is rejected (400). Depth is controlled by `effort`.
 *   - `temperature`/`top_p`/`top_k` are rejected. Steering is done in the prompt.
 *   - Structured outputs guarantee the response parses and stays in-vocabulary.
 */
import { CATEGORIES, LOCATIONS, OUTFIT_LAYER_KEYS } from '@/lib/constants'

export const CLAUDE_MODEL = 'claude-sonnet-5'

/**
 * Constrains the reply to exactly the six locations and four categories the app
 * understands, so a hallucinated "in the wardrobe" can't reach storage.
 * `additionalProperties: false` and a full `required` list are mandatory.
 */
const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: CATEGORIES },
    location: { type: 'string', enum: LOCATIONS },
    layer: {
      type: 'string',
      enum: [...OUTFIT_LAYER_KEYS, 'none'],
      description: 'Apparel layer if this is clothing, otherwise "none".',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Up to 6 lowercase keywords: colour, material, style, genre.',
    },
    rationale: {
      type: 'string',
      description: 'One short sentence explaining the placement.',
    },
  },
  required: ['category', 'location', 'layer', 'tags', 'rationale'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You sort a single person's bedroom inventory.

For each item you are given, decide:
- category: one of ${CATEGORIES.join(', ')}.
- location: one of exactly these six spots, no others -- ${LOCATIONS.map((l) => `"${l}"`).join(', ')}.
- layer: if the item is clothing or a worn accessory, the apparel layer it occupies; otherwise "none".
- tags: up to six lowercase keywords someone would plausibly search for later (colour, material, style, genre).
- rationale: one short sentence.

How to choose a location:
- Clothing that hangs or folds -> "in closet".
- Bulky, seasonal, or out-of-rotation things, and most shoes -> "under bed".
- Books, decor, and display items -> "on shelf".
- Small loose items, cables, jewellery, keys, stationery -> "in the desk drawer".
- Equipment actively set up on the desk -> "in desk".
- Only use "currently in use" when the description says it is in use right now.

Deliver exactly what was asked for. Do not invent details the item description does not support -- if the colour or material is not stated or visible, leave it out of the tags rather than guessing.`

/** Splits a data: URI into the pieces the image content block wants. */
function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl ?? '')
  if (!match) return null
  const [, mediaType, data] = match
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
    return null
  }
  return { mediaType, data }
}

let clientPromise = null
let cachedKey = null

async function getClient(apiKey) {
  if (!clientPromise || cachedKey !== apiKey) {
    cachedKey = apiKey
    clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) => {
      return new Anthropic({
        apiKey,
        // Required to construct the client in a page context at all, and the
        // header the API needs to accept a direct browser request.
        dangerouslyAllowBrowser: true,
        defaultHeaders: {
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      })
    })
  }
  return clientPromise
}

/**
 * Returns the raw parsed suggestion object. Callers run it through
 * `coerceSuggestion` before trusting any field.
 */
export async function classifyWithClaude({ name, description, image }, apiKey) {
  const client = await getClient(apiKey)

  const content = []

  const parsedImage = image ? parseDataUrl(image) : null
  if (parsedImage) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: parsedImage.mediaType,
        data: parsedImage.data,
      },
    })
  }

  content.push({
    type: 'text',
    text: [
      `Item name: ${name || '(none given)'}`,
      description ? `Description: ${description}` : null,
      parsedImage ? 'A photo of the item is attached.' : null,
      'Sort this item.',
    ]
      .filter(Boolean)
      .join('\n'),
  })

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: SUGGESTION_SCHEMA },
    },
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to classify this item.')
  }

  const text = response.content.find((block) => block.type === 'text')?.text
  if (!text) throw new Error('Claude returned no text to parse.')

  return JSON.parse(text)
}

/** Cheap round-trip so Settings can verify a key without adding an item. */
export async function testConnection(apiKey) {
  const result = await classifyWithClaude(
    { name: 'blue cotton t-shirt', description: 'plain navy tee' },
    apiKey
  )
  return result
}
