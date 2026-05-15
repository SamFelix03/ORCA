#!/usr/bin/env python3
import json
import sys

args = sys.argv[1:]

def out(obj):
    print(json.dumps(obj))

if len(args) >= 2 and args[0] == 'agent:session' and args[1] == 'list':
    out({"sessions": [{"sessionId": "sess-mock-1", "delegation": {"payment_policy": {"assets": ["USDC", "PIEUSD"]}}}]})
elif len(args) >= 2 and args[0] == 'agent:session' and args[1] == 'create':
    out({"requestId": "req-mock-1"})
elif len(args) >= 2 and args[0] == 'agent:session' and args[1] == 'status':
    out({"status": "approved"})
elif len(args) >= 2 and args[0] == 'agent:session' and args[1] == 'use':
    out({"ok": True})
elif len(args) >= 2 and args[0] == 'agent:session' and args[1] == 'execute':
    out({"txHash": "0x" + "1"*64})
else:
    out({"ok": True, "args": args})
