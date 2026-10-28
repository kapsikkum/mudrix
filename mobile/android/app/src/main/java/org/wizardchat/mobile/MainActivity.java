package org.wizardchat.mobile;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(WizardChatPlugin.class);
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                onBack();
            }
        });
    }

    // The web app closes dialogs/drawers or navigates back (src/util/nativeApp.ts);
    // false means it is at the root, null means it isn't loaded.
    private void onBack() {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript("window.wizardchatNativeBack ? window.wizardchatNativeBack() : null", (result) -> {
            if ("true".equals(result)) return;
            if ("null".equals(result) && webView.canGoBack()) {
                webView.goBack();
            } else {
                moveTaskToBack(true);
            }
        });
    }
}
