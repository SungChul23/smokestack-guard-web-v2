// 미리보기 모드 판정 및 가짜 로그인 정보.
// VITE_COGNITO_CLIENT_ID 환경 변수가 비어 있을 때만 미리보기 모드가 켜진다.

export function isPreviewMode(): boolean {
  // AI Studio 미리보기에는 Cognito 값이 없어 미리보기, 운영 빌드(CI가 SSM 값을 넣음)·로컬(.env.local)은 실제 로그인·서버 API
  return !import.meta.env.VITE_COGNITO_CLIENT_ID;
}

export const PREVIEW_EMAIL = "preview@example.com";
export const PREVIEW_USER_NAME = "미리보기";
export const PREVIEW_ACCESS_TOKEN = "preview";
export const PREVIEW_FRESHNESS_OFFSET_MS = 2 * 60 * 1000;
export const previewLogout = (): void => {};
