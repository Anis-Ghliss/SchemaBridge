import { Plug, Radio, Send } from "lucide-react";
import { useAppStore } from "../store";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { EmptyState } from "../components/EmptyState";
import { TryPanel } from "./observe/TryPanel";
import { LivePanel } from "./observe/LivePanel";

export function ObserveView() {
  const { bindings, setView } = useAppStore();

  if (bindings.length === 0) {
    return (
      <EmptyState
        icon={Plug}
        title="Nothing to observe yet"
        description="Wire a binding in the Deploy step, then come back here to send a test request and watch live traffic."
        action={<Button onClick={() => setView("deploy")}>Go to Deploy</Button>}
      />
    );
  }

  return (
    <Tabs defaultValue="try">
      <TabsList className="mb-4">
        <TabsTrigger value="try"><Send className="h-3.5 w-3.5" /> Try it</TabsTrigger>
        <TabsTrigger value="live"><Radio className="h-3.5 w-3.5" /> Live traffic</TabsTrigger>
      </TabsList>
      <TabsContent value="try"><TryPanel /></TabsContent>
      <TabsContent value="live"><LivePanel /></TabsContent>
    </Tabs>
  );
}
