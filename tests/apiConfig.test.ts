import { describe, it, expect } from 'vitest';
import { tunnelRequestHeaders } from '../src/api/apiConfig';

describe('tunnelRequestHeaders', () => {
  it('adds Bypass-Tunnel-Reminder for localtunnel / loca.lt hosts', () => {
    expect(tunnelRequestHeaders('https://abc123.loca.lt')).toEqual({
      'Bypass-Tunnel-Reminder': 'true',
    });
    expect(tunnelRequestHeaders('https://foo.localtunnel.me/')).toEqual({
      'Bypass-Tunnel-Reminder': 'true',
    });
  });

  it('adds ngrok-skip-browser-warning for ngrok free / classic hosts', () => {
    expect(tunnelRequestHeaders('https://abc.ngrok-free.app')).toEqual({
      'ngrok-skip-browser-warning': 'true',
    });
    expect(tunnelRequestHeaders('https://abc.ngrok-free.dev')).toEqual({
      'ngrok-skip-browser-warning': 'true',
    });
    expect(tunnelRequestHeaders('https://abc.ngrok.app')).toEqual({
      'ngrok-skip-browser-warning': 'true',
    });
    expect(tunnelRequestHeaders('https://abc.ngrok.io')).toEqual({
      'ngrok-skip-browser-warning': 'true',
    });
  });

  it('skips header for normal / cloudflare hosts', () => {
    expect(tunnelRequestHeaders('https://example.trycloudflare.com')).toEqual({});
    expect(tunnelRequestHeaders('http://127.0.0.1:8787')).toEqual({});
    expect(tunnelRequestHeaders('')).toEqual({});
  });
});
