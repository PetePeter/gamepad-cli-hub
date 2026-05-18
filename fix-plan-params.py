#!/usr/bin/env python3
"""Fix plan parameter names (args.id -> args.uuid) in localhost-mcp-server.ts"""

import re

with open('src/mcp/localhost-mcp-server.ts', 'r') as f:
    content = f.read()

# Replace args.id with args.uuid for plan operations
# These are the cases where the parameter should be uuid:
# - plan_get
# - plan_update
# - plan_delete
# - plan_set_state
# - plan_reopen

replacements = [
    # plan_get
    (r"case 'plan_get':\s+return requireResult\(\s+this\.service\.getPlan\(asString\(args\.id,",
     "case 'plan_get':\n        return requireResult(\n          this.service.getPlan(asString(args.uuid,"),

    # plan_update
    (r"case 'plan_update':\s+return requireResult\(\s+this\.service\.updatePlan\(asString\(args\.id,",
     "case 'plan_update':\n        return requireResult(\n          this.service.updatePlan(asString(args.uuid,"),

    # plan_delete
    (r"case 'plan_delete':\s+return \{\s+deleted: requireBooleanResult\(\s+this\.service\.deletePlan\(asString\(args\.id,",
     "case 'plan_delete':\n        return {\n          deleted: requireBooleanResult(\n            this.service.deletePlan(asString(args.uuid,"),

    # plan_set_state
    (r"case 'plan_set_state':\s+return this\.setPlanStateWithValidation\(\s+asString\(args\.id,",
     "case 'plan_set_state':\n        return this.setPlanStateWithValidation(\n          asString(args.uuid,"),

    # plan_reopen
    (r"case 'plan_reopen':\s+return requireResult\(\s+this\.service\.reopenPlan\(asString\(args\.id,",
     "case 'plan_reopen':\n        return requireResult(\n          this.service.reopenPlan(asString(args.uuid,"),
]

for old, new in replacements:
    content = re.sub(old, new, content, flags=re.MULTILINE)

# Also fix error messages that reference args.id where uuid is expected
content = re.sub(
    r"`Plan not found: \${asString\(args\.id,",
    r"`Plan not found: ${asString(args.uuid,",
    content
)
content = re.sub(
    r"`Plan \${asString\(args\.id,",
    r"`Plan ${asString(args.uuid,",
    content
)

# Add plan_get_id handler after plan_get if it's missing
if "case 'plan_get_id':" not in content:
    # Find the location to insert it
    plan_get_pattern = r"(case 'plan_get':.*?case ')("
    if re.search(plan_get_pattern, content, re.DOTALL):
        insertion_point = "      case 'plan_get_id':\n        return this.service.getPlanIdMapping(asString(args.humanId, 'humanId is required'));\n"
        # Find after plan_get block ends
        content = re.sub(
            r"(case 'plan_get':.*?\n        \);)\n(\s+case ')",
            r"\1\n" + insertion_point + r"\2",
            content,
            flags=re.DOTALL
        )

with open('src/mcp/localhost-mcp-server.ts', 'w') as f:
    f.write(content)

print("[OK] Fixed plan parameter names and added plan_get_id")
