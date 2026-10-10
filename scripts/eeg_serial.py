"""macOS/POSIX receive-only serial bridge; JSON lines to stdout, no dependencies."""
import argparse
import copy
import fcntl
import json
import os
import select
import signal
import subprocess
import sys
import termios
import time

from thinkgear import ThinkGearParser


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--port', required=True)
    args.add_argument('--baud', type=int, default=9600, choices=[9600, 19200, 38400, 57600, 115200])
    opts = args.parse_args()
    fd, original = None, None
    running = True

    def stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        # Do not compete with another program already consuming the same sensor.
        lsof = subprocess.run(['/usr/sbin/lsof', '-t', opts.port, opts.port.replace('/cu.', '/tty.')],
                              capture_output=True, text=True, timeout=5)
        if lsof.stdout.strip():
            raise RuntimeError('串口已被其他程序占用，请先关闭该程序的串口连接')
        fd = os.open(opts.port, os.O_RDONLY | os.O_NOCTTY | os.O_NONBLOCK)
        fcntl.ioctl(fd, termios.TIOCEXCL)
        original = termios.tcgetattr(fd)
        config = copy.deepcopy(original)
        config[0] = 0
        config[1] = 0
        config[2] = termios.CLOCAL | termios.CREAD | termios.CS8
        config[3] = 0
        config[4] = config[5] = getattr(termios, f'B{opts.baud}')
        config[6][termios.VMIN] = 0
        config[6][termios.VTIME] = 0
        termios.tcsetattr(fd, termios.TCSANOW, config)
        emit({'type': 'status', 'state': 'connected', 'port': opts.port, 'baud': opts.baud})
        parser = ThinkGearParser()
        while running:
            ready, _, _ = select.select([fd], [], [], 0.2)
            if not ready:
                continue
            try:
                chunk = os.read(fd, 4096)
            except BlockingIOError:
                continue
            if not chunk:
                raise RuntimeError('串口已断开')
            emit({'type': 'data', 'timestamp': time.time_ns() // 1_000_000,
                  'length': len(chunk), 'hex': chunk.hex(' ').upper(),
                  'packets': parser.feed(chunk), 'unframedBytes': parser.discarded})
    except Exception as error:
        emit({'type': 'status', 'state': 'error', 'message': str(error)})
        return 1
    finally:
        if fd is not None:
            try:
                if original is not None:
                    termios.tcsetattr(fd, termios.TCSANOW, original)
            except (OSError, termios.error):
                pass
            try:
                fcntl.ioctl(fd, termios.TIOCNXCL)
            except OSError:
                pass
            os.close(fd)
    return 0


if __name__ == '__main__':
    sys.exit(main())
