// Copyright 2024 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-env mocha */
/* global chai, sinon */

describe('Power Events', () => {
  const { expect } = chai;
  let manualConnectSpy;
  let originalGetSocketStatus;
  let ipcRenderer;

  beforeEach(async () => {
    // Ensure testUtilities and other globals are ready if needed
    if (window.testUtilities && window.testUtilities.waitUntilReady) {
      await window.testUtilities.waitUntilReady();
    }

    // Dynamic import for ipcRenderer if in Electron, otherwise mock for Node tests
    if (typeof window !== 'undefined' && window.require) {
        const electron = window.require('electron');
        ipcRenderer = electron.ipcRenderer;
    } else {
        // Basic mock for non-Electron environments if any test parts run there
        ipcRenderer = { send: sinon.stub(), on: sinon.stub(), invoke: sinon.stub().resolves() };
    }

    // It's crucial that ts/background.ts has fully initialized window.server and window.manualConnect
    // This might require a delay or a more robust readiness check.
    // For now, assuming it's ready after a short timeout or by the time tests run.
    if (!window.manualConnect || !window.getSocketStatus || !window.SocketStatus) {
      // This indicates an issue with test setup or timing
      // Forcing a load or waiting for an event from background.ts might be needed.
      // console.warn('manualConnect or getSocketStatus not ready. Tests might be unreliable.');

      // A simple way to wait for background.ts to be ready, if it emits an event
      await new Promise(resolve => {
        if (window.manualConnect && window.getSocketStatus && window.SocketStatus) {
          resolve();
          return;
        }
        const onReady = () => {
          window.Whisper.events.off('backgroundReadyForTest', onReady); // Ensure we clean up
          resolve();
        };
        window.Whisper.events.on('backgroundReadyForTest', onReady);
        // If background.ts doesn't emit such an event, this will hang.
        // Consider adding a ready event in background.ts for tests.
      });
    }

    manualConnectSpy = sinon.spy(window, 'manualConnect');
    originalGetSocketStatus = window.getSocketStatus;
  });

  afterEach(() => {
    manualConnectSpy.restore();
    if (originalGetSocketStatus) {
      window.getSocketStatus = originalGetSocketStatus;
    }
    // Clean up any IPC listeners specific to this test if necessary
  });

  it('should attempt reconnection via manualConnect on power resume if socket is not online', (done) => {
    // Ensure isSocketOnline() will return false
    window.getSocketStatus = sinon.stub().returns({
      authenticated: { status: window.SocketStatus.CLOSED },
      unauthenticated: { status: window.SocketStatus.CLOSED },
    });

    // 1. Simulate suspend (optional, but good for cycle)
    ipcRenderer.send('test-simulate-power-suspend');

    // 2. Simulate resume
    ipcRenderer.send('test-simulate-power-resume');

    // Give IPC and event loop a moment to process
    setTimeout(() => {
      try {
        expect(manualConnectSpy.calledOnce).to.equal(true, 'manualConnect should have been called');
        done();
      } catch (e) {
        done(e);
      }
    }, 100); // Adjust timeout if needed for event propagation
  });

  it('should NOT attempt reconnection via manualConnect on power resume if socket IS online', (done) => {
    // Ensure isSocketOnline() will return true
     window.getSocketStatus = sinon.stub().returns({
      authenticated: { status: window.SocketStatus.OPEN },
      unauthenticated: { status: window.SocketStatus.OPEN },
    });

    ipcRenderer.send('test-simulate-power-resume');

    setTimeout(() => {
      try {
        expect(manualConnectSpy.called).to.equal(false, 'manualConnect should NOT have been called');
        done();
      } catch (e) {
        done(e);
      }
    }, 100);
  });
});

// Helper in case background.ts needs to signal readiness (add this to background.ts if used):
// if (getEnvironment() === Environment.Test) {
//   window.Whisper.events.trigger('backgroundReadyForTest');
// }
