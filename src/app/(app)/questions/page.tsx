import { Suspense } from "react";
import { ApplicationScreen } from "@/components/questions/application-screen";

export default function QuestionsPage() {
  return <Suspense><ApplicationScreen /></Suspense>;
}
