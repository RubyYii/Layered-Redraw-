# DeepSeek official pricing evidence extract

- Official source: https://api-docs.deepseek.com/quick_start/pricing
- Retrieved at: 2026-08-24T05:50:34Z
- Scope: relevant price facts archived for the CP03 Stage B zero-call preflight; this is not a copy of the complete page.
- Unit: USD per 1 million tokens.

| Model | Input condition selected for the manifest | Input | Output |
| --- | --- | ---: | ---: |
| deepseek-v4-flash | peak, cache miss | 0.44 | 1.32 |
| deepseek-v4-pro | peak, cache miss | 1.32 | 3.96 |

The official page publishes lower cache-hit and off-peak rates as well. The manifest intentionally uses the peak cache-miss input rate and peak output rate, so the preflight estimate does not depend on a cache discount or dispatch time.
