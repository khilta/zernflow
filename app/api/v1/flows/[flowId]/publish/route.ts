import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TriggerType } from "@/lib/types/database";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership)
    return NextResponse.json({ error: "No workspace" }, { status: 404 });

  // Get current flow
  const { data: flow, error } = await supabase
    .from("flows")
    .select("*")
    .eq("id", flowId)
    .eq("workspace_id", membership.workspace_id)
    .single();

  if (error || !flow)
    return NextResponse.json(
      { error: error?.message || "Flow not found" },
      { status: 404 }
    );

  // Update flow status to published and increment version
  const newVersion = flow.version + 1;
  await supabase
    .from("flows")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      version: newVersion,
    })
    .eq("id", flowId);

  // Save version snapshot
  await supabase.from("flow_versions").insert({
    flow_id: flowId,
    version: newVersion,
    nodes: flow.nodes,
    edges: flow.edges,
    viewport: flow.viewport,
    name: flow.name,
    published_by: user.id,
  });

  // Sync trigger rows from the flow's trigger nodes into the `triggers` table.
  // The runtime matcher (lib/flow-engine/trigger-matcher.ts) reads triggers.config,
  // but the builder only ever saved keywords into flows.nodes — so triggers configured
  // in the UI never fired in production. Reconcile them here on publish. This includes
  // `comment_keyword`: builder-created rows are workspace-wide (channel_id null), while
  // Growth-tab rows are channel-scoped (channel_id set) and must survive republish —
  // hence the null-channel guard on the delete below.
  const BUILDER_TRIGGER_TYPES = [
    "keyword",
    "postback",
    "quick_reply",
    "welcome",
    "default",
    "comment_keyword",
  ] as const;
  type BuilderTriggerType = (typeof BUILDER_TRIGGER_TYPES)[number];
  const isBuilderTriggerType = (t: string): t is BuilderTriggerType =>
    (BUILDER_TRIGGER_TYPES as readonly string[]).includes(t);

  const flowNodes = Array.isArray(flow.nodes) ? (flow.nodes as Array<Record<string, any>>) : [];
  const desiredTriggers = flowNodes
    .filter((n) => n?.type === "trigger")
    .map((n) => {
      const data = (n.data ?? {}) as Record<string, any>;
      const nodeConfig = (data.config ?? {}) as Record<string, any>;
      const type = (data.triggerType ?? "keyword") as string;
      if (!isBuilderTriggerType(type)) return null;

      // The trigger panel stores keywords as data.keywords ([{ value, matchType }]);
      // template-seeded nodes store data.config.keywords ([string]). The matcher
      // accepts both shapes, so pass through whichever the node carries.
      const config: Record<string, any> = {};
      if (type === "keyword" || type === "comment_keyword") {
        config.keywords = data.keywords ?? nodeConfig.keywords ?? [];
        if (nodeConfig.matchType) config.matchType = nodeConfig.matchType;
        const postIds = data.postIds ?? nodeConfig.postIds;
        if (Array.isArray(postIds) && postIds.length > 0) config.postIds = postIds;
        const replyText = data.replyText ?? nodeConfig.replyText;
        if (typeof replyText === "string" && replyText.trim()) config.replyText = replyText;
      } else if (type === "postback" || type === "quick_reply") {
        const payload = data.payload ?? nodeConfig.payload;
        if (payload !== undefined) config.payload = payload;
      }

      return {
        flow_id: flowId,
        channel_id: null,
        type: type as TriggerType,
        config,
        is_active: true,
        priority: typeof nodeConfig.priority === "number" ? nodeConfig.priority : 0,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  // Dual-trigger: when a comment_keyword trigger has `alsoMatchInDMs` enabled,
  // create an additional `keyword` type trigger for the same flow so the same
  // keywords also match in direct messages (not just comments).
  const extraTriggers: typeof desiredTriggers = [];
  for (const node of flowNodes.filter((n) => n?.type === "trigger")) {
    const data = (node.data ?? {}) as Record<string, any>;
    const type = (data.triggerType ?? "keyword") as string;
    if (type === "comment_keyword" && data.alsoMatchInDMs) {
      const config: Record<string, any> = {};
      const keywords = data.keywords ?? [];
      if (keywords.length > 0) {
        config.keywords = keywords;
        // No replyText — DM triggers don't post public comment replies
      }
      extraTriggers.push({
        flow_id: flowId,
        channel_id: null,
        type: "keyword" as TriggerType,
        config,
        is_active: true,
        priority: 0,
      });
    }
  }

  // Reconcile: clear only the builder-managed trigger rows whose types appear in
  // the current node graph (including the dual-trigger 'keyword' type if enabled),
  // then insert the fresh set. This preserves trigger rows of other types that may
  // have been added programmatically (e.g. via Growth tab or external tools).
  // Only null-channel rows are builder-managed; channel-scoped rows belong to Growth tab.
  const allTriggers = [...desiredTriggers, ...extraTriggers];
  const managedTypes = [...new Set(allTriggers.map((t) => t.type))];
  if (managedTypes.length > 0) {
    await supabase
      .from("triggers")
      .delete()
      .eq("flow_id", flowId)
      .is("channel_id", null)
      .in("type", managedTypes);
  }

  if (allTriggers.length > 0) {
    const { error: insertError } = await supabase.from("triggers").insert(allTriggers);
    if (insertError) {
      console.error("[publish] Failed to sync triggers from flow nodes:", insertError);
    }
  }

  // Activate any remaining triggers for this flow (e.g. comment_keyword managed elsewhere).
  await supabase
    .from("triggers")
    .update({ is_active: true })
    .eq("flow_id", flowId);

  return NextResponse.json({ ...flow, version: newVersion });
}
