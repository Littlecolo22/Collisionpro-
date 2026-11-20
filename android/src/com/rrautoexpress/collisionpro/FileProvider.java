package com.rrautoexpress.collisionpro;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Serves estimate PDFs (cache/pdf) to viewers and share targets, and receives camera photos (cache/capture). */
public class FileProvider extends ContentProvider {
    public static final String AUTH = "com.rrautoexpress.collisionpro.files";

    public static Uri uriFor(String dir, String name) {
        return Uri.parse("content://" + AUTH + "/" + dir + "/" + Uri.encode(name));
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        java.util.List<String> seg = uri.getPathSegments();
        if (seg.size() != 2) throw new FileNotFoundException();
        String dir = seg.get(0), name = seg.get(1);
        if (!("pdf".equals(dir) || "capture".equals(dir)) || name.contains("/") || name.contains("..")) throw new FileNotFoundException();
        File d = new File(getContext().getCacheDir(), dir);
        d.mkdirs();
        return new File(d, name);
    }

    @Override public boolean onCreate() { return true; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        boolean write = mode.contains("w");
        if (write && !"capture".equals(uri.getPathSegments().get(0))) throw new FileNotFoundException("read only");
        if (write) {
            try { f.createNewFile(); } catch (IOException e) { throw new FileNotFoundException(e.getMessage()); }
            return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE);
        }
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri uri) {
        String n = uri.getLastPathSegment() == null ? "" : uri.getLastPathSegment().toLowerCase();
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    @Override public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        String[] cols = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        c.addRow(row);
        return c;
    }

    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
