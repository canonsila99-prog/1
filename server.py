"""Локальный статический сервер; без зависимостей и записи данных на сервере."""
import argparse
import functools
import http.server
from pathlib import Path
from urllib.parse import unquote, urlsplit
import webbrowser

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.webmanifest': 'application/manifest+json'}
    def do_GET(self):
        allowed = {'/', '/index.html', '/style.css', '/app.js', '/engine.js', '/data.js', '/storage.js', '/sw.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'}
        if unquote(urlsplit(self.path).path) not in allowed:
            self.send_error(404)
            return
        super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--open', action='store_true', help='Открыть браузер после запуска')
    args = parser.parse_args()
    handler = functools.partial(Handler, directory=str(Path(__file__).resolve().parent))
    with http.server.ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f'Калькулятор запущен. Порт: {args.port}. Остановка: Ctrl+C.', flush=True)
        if args.open:
            webbrowser.open(f'http://localhost:{args.port}')
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
if __name__ == '__main__':
    main()
