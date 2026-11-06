import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicProfileScreen } from "@/components/public-profile/public-profile-screen";

// 로그인 없이 여는 공개 페이지 — 사이드바 · 로그인 문이 있는 (app) 묶음 밖이다(S-65 · S-66)
export const metadata: Metadata = {
  title: "공개 프로필",
  description: null,
  robots: { index: false },
};

type Params = Promise<{ token: string }>;

async function Profile({ params }: { params: Params }) {
  const { token } = await params;
  return <PublicProfileScreen token={token} />;
}

// cacheComponents 는 주소 값(params)을 Suspense 안에서 읽게 한다
export default function PublicProfilePage({ params }: { params: Params }) {
  return <Suspense><Profile params={params} /></Suspense>;
}
