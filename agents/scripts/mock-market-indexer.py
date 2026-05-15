#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import time

class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return

    def do_GET(self):
        if self.path == '/v1/markets':
            now = int(time.time())
            self._send(200, {
                "markets": [
                    {"chain_id": 2368, "chain_name": "kitetestnet", "protocol": "aave-v3", "apy": "3.2", "tvl_usdc": "1000000", "utilization": "0.60", "timestamp": now},
                    {"chain_id": 84532, "chain_name": "basesepolia", "protocol": "morpho", "apy": "6.1", "tvl_usdc": "800000", "utilization": "0.55", "timestamp": now},
                    {"chain_id": 11155111, "chain_name": "sepolia", "protocol": "compound-v3", "apy": "2.4", "tvl_usdc": "600000", "utilization": "0.50", "timestamp": now}
                ]
            })
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == '/query':
            self._send(200, {"data": {"subgraph": {"id": "mock-subgraph"}}})
        else:
            self._send(404, {"error": "not found"})

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', 9091), H)
    print('mock-market-indexer listening on 127.0.0.1:9091', flush=True)
    server.serve_forever()
