import { createRoot } from "react-dom/client";
import { TopicEditor } from "../../src/components/topic-editor";
import { Library } from "../../src/components/library";
import { TeachingRoom } from "../../src/components/teaching-room";
import "../../src/app/globals.css";
const view = new URLSearchParams(location.search).get("view");
createRoot(document.getElementById("root")!).render(
  <>
    <p style={{ padding: 12, background: "#f5e8d8" }}>
      TEST HARNESS · mocked API responses · no real account or database
    </p>
    {view === "library" ? (
      <Library />
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
