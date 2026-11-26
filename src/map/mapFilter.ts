// 지도에 표시할 사업장을 거른다(순수 함수). 정상·주의·경고·위험·초과와 측정 없음(gap)을 각각 켜고 끌 수 있다.
// 상단 상태 바 카드(statusFilter)가 켜져 있으면 해당 단계만 남긴다.
import type { SiteState } from "../data/model";
import type { LevelKey } from "../logic/status";
import type { MapShowKey } from "../state/selection";

/** 사업장의 표시 종류: 단계가 없으면(측정값 없음) gap */
export const showKeyOf = (s: SiteState): MapShowKey => s.level ?? "gap";

/**
 * 지도에 그릴 사업장의 인덱스. 거른 사업장은 묶음 계산에서도 빠지므로 묶음의 개수·대표 단계는 보이는 것만 센다.
 * onlyIds를 주면(즐겨찾기만 보기) 그 사업장만 남긴다.
 * statusFilter가 비어 있지 않으면 해당 경고 단계에 속하는 사업장만 남긴다.
 */
export function visibleIndices(
  states: SiteState[],
  shown: readonly MapShowKey[],
  onlyIds?: ReadonlySet<string> | null,
  statusFilter?: readonly LevelKey[] | null,
): number[] {
  const on = new Set<string>(shown);
  const statuses = statusFilter && statusFilter.length > 0 ? new Set<LevelKey>(statusFilter) : null;
  const out: number[] = [];
  states.forEach((s, i) => {
    if (onlyIds && !onlyIds.has(s.site.id)) return;
    if (statuses) {
      if (s.level && statuses.has(s.level)) out.push(i);
      return;
    }
    if (on.has(showKeyOf(s))) out.push(i);
  });
  return out;
}
