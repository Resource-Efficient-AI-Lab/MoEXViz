import { useEffect, useState } from 'react';
import type { UmapData, UmapPoint, UmapTopToken } from './types';
import { domainModel, type DomainModelKey } from '../v2/domain/models';

interface UseDomainUmapResult {
  data: UmapData | null;
  loading: boolean;
  error: Error | null;
}

// Raw shapes as each model's *domain_specialization_umap.json actually names its fields —
// remapped to the "category" naming our components already use (see rewiring-frontend.md's
// "keep category" rule). All three models share this schema.
interface RawUmapTopToken {
  token: string;
  score: number;
  domain: string;
}
interface RawUmapPoint {
  layer_id: number;
  expert_id: number;
  x: number;
  y: number;
  dominant_domain: string;
  domain_activation_rate: Record<string, number>;
  top_tokens: RawUmapTopToken[];
}
interface RawUmapData {
  domains: string[];
  num_layers: number;
  num_experts: number;
  points: RawUmapPoint[];
}

function toUmapPoint(raw: RawUmapPoint): UmapPoint {
  return {
    layer_id: raw.layer_id,
    expert_id: raw.expert_id,
    x: raw.x,
    y: raw.y,
    dominant_category: raw.dominant_domain,
    activation_rate: raw.domain_activation_rate,
    top_tokens: raw.top_tokens.map(
      (t): UmapTopToken => ({ token: t.token, score: t.score, category: t.domain })
    ),
  };
}

/** The last completed fetch, tagged with the path it came from — so a model switch never renders
 *  a frame of the previous model's map under the new model's label (effects run after paint, so
 *  clearing state inside the effect would be one frame too late). */
interface Loaded {
  path?: string;
  data: UmapData | null;
  error: Error | null;
}

/** `null` is "don't fetch" — see useDomainSpecialization. */
export function useDomainUmap(modelKey: DomainModelKey | null): UseDomainUmapResult {
  const umapPath = modelKey ? domainModel(modelKey).umapPath : null;
  const [loaded, setLoaded] = useState<Loaded>({ data: null, error: null });

  useEffect(() => {
    if (!umapPath) return;
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}data/${umapPath}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch domain UMAP data: ${res.status}`);
        }
        return res.json() as Promise<RawUmapData>;
      })
      .then((raw) => {
        if (cancelled) return;
        setLoaded({
          path: umapPath,
          error: null,
          data: {
            domains: raw.domains,
            num_layers: raw.num_layers,
            num_experts: raw.num_experts,
            points: raw.points.map(toUmapPoint),
          },
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded({
            path: umapPath,
            data: null,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [umapPath]);

  const fresh = loaded.path === umapPath;
  const data = fresh ? loaded.data : null;
  const error = fresh ? loaded.error : null;

  return { data, loading: !!umapPath && !data && !error, error };
}
