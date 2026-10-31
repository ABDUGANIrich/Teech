import { createRoot } from "react-dom/client";
import { StrictMode, useState } from "react";
import { TopicEditor } from "../../src/components/topic-editor";
import { Library } from "../../src/components/library";
import { TeachingRoom } from "../../src/components/teaching-room";
import { LearningRoom } from "../../src/components/learning-room";
import { LearningSetup } from "../../src/components/learning-setup";
import { AuthForm } from "../../src/components/auth-form";
import { PasswordForm } from "../../src/components/password-form";
import "../../src/app/globals.css";
const view = new URLSearchParams(location.search).get("view");
function EditorNavigation() {
  const [edit, setEdit] = useState<string | undefined>();
  return (
    <>
      <button onClick={() => setEdit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")}>
        Edit first topic
      </button>
      <button onClick={() => setEdit("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")}>
        Edit second topic
      </button>
      <button onClick={() => setEdit(undefined)}>New topic</button>
      <TopicEditor userId="test-user" edit={edit} />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <>
    <p style={{ padding: 12, background: "#f5e8d8" }}>
      TEST HARNESS · mocked API responses · no real account or database
    </p>
    {view === "auth" ? (
      <AuthForm
        configured
        failed={false}
        next={new URLSearchParams(location.search).get("next") || undefined}
      />
    ) : view === "password" ? (
      <PasswordForm />
    ) : view === "prefilled-setup" ? (
      <LearningSetup
        userId="test-user"
        sourceId={new URLSearchParams(location.search).get("source") || "a"}
        prefill={{
          topic: "Original topic",
          notes: "Original notes",
          level: "new",
          goal: "",
        }}
      />
    ) : view === "learning-room" || location.pathname.startsWith("/learn/") ? (
      <StrictMode>
        <LearningRoom
          id={
            location.pathname.startsWith("/learn/")
              ? location.pathname.split("/")[2]
              : "99999999-9999-4999-8999-999999999999"
          }
          userId="test-user"
        />
      </StrictMode>
    ) : view === "learning-setup" ? (
      <LearningSetup userId="test-user" />
    ) : view === "editor-navigation" ? (
      <EditorNavigation />
    ) : view === "library" ? (
      <Library />
    ) : view === "live-sample" ? (
      <TeachingRoom live userId="test-user" />
    ) : view === "room" ? (
      <TeachingRoom
        live
        id="11111111-1111-4111-8111-111111111111"
        userId="test-user"
      />
    ) : (
      <TopicEditor userId="test-user" />
    )}
  </>,
);
