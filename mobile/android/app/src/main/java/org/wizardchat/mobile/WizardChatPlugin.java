package org.wizardchat.mobile;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
import androidx.activity.result.ActivityResult;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;

// Called from wizardchat-web's src/util/nativeApp.ts via Capacitor.nativePromise('WizardChat', …)
@CapacitorPlugin(name = "WizardChat")
public class WizardChatPlugin extends Plugin {

    private byte[] pendingFile;

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        int toolbarColor = ContextCompat.getColor(getContext(), R.color.wizardchatBackground);
        CustomTabsIntent intent = new CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(new CustomTabColorSchemeParams.Builder().setToolbarColor(toolbarColor).build())
            .build();
        getActivity().runOnUiThread(() -> {
            try {
                intent.launchUrl(getActivity(), Uri.parse(url));
                call.resolve();
            } catch (ActivityNotFoundException e) {
                call.reject("No browser available", e);
            }
        });
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("data is required");
            return;
        }
        String filename = call.getString("filename", "download");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                saveToDownloads(filename, mimeType, bytes);
                toast(getContext().getString(R.string.download_saved, filename));
                call.resolve();
            } catch (IOException e) {
                call.reject("Saving failed", e);
            }
            return;
        }

        // Android 8/9: no MediaStore.Downloads, let the user pick a location instead
        pendingFile = bytes;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mimeType)
            .putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "onDocumentCreated");
    }

    @ActivityCallback
    private void onDocumentCreated(PluginCall call, ActivityResult result) {
        byte[] bytes = pendingFile;
        pendingFile = null;
        Uri uri = result.getData() != null ? result.getData().getData() : null;
        if (result.getResultCode() != Activity.RESULT_OK || uri == null || bytes == null) {
            call.reject("Cancelled");
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IOException("No output stream");
            out.write(bytes);
            call.resolve();
        } catch (IOException e) {
            call.reject("Saving failed", e);
        }
    }

    private void saveToDownloads(String filename, String mimeType, byte[] bytes) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("MediaStore insert failed");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("No output stream");
            out.write(bytes);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
    }

    private void toast(String message) {
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show());
    }
}
