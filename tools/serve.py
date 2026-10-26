#!/usr/bin/env python3
"""Static server for dist/ that refuses to be cached.

The preview browser was holding on to old builds through server restarts,
which cost a couple of confusing debugging rounds. No-store settles it.
"""
import http.server, socketserver, sys, os, socket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8177
ROOT = sys.argv[2] if len(sys.argv) > 2 else "dist"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, *a):
        pass

class DualStackServer(http.server.ThreadingHTTPServer):
    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except Exception:
            pass
        return super().server_bind()
    address_family = socket.AF_INET6

DualStackServer.allow_reuse_address = True

try:
    with DualStackServer(("::", PORT), Handler) as httpd:
        print(f"serving {ROOT} on {PORT} (dual-stack IPv4/IPv6, multi-threaded) with caching disabled")
        httpd.serve_forever()
except Exception as e:
    class FallbackServer(http.server.ThreadingHTTPServer):
        pass
    FallbackServer.allow_reuse_address = True
    with FallbackServer(("", PORT), Handler) as httpd:
        print(f"serving {ROOT} on {PORT} (multi-threaded IPv4) with caching disabled")
        httpd.serve_forever()

