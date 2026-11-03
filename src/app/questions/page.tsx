import { Suspense } from "react";
import { QuestionScreen } from "@/components/questions/question-screen";

export default function QuestionsPage() {
  return <Suspense><QuestionScreen /></Suspense>;
}
