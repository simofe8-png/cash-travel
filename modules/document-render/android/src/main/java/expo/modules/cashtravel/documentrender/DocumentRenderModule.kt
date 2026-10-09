package expo.modules.cashtravel.documentrender

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max
import kotlin.math.min

/**
 * Cash Travel document viewer support (ADR-0013): turns app-private PDFs and images into display
 * JPEGs in the app cache, using only Android platform APIs (PdfRenderer, ImageDecoder).
 * Reads and writes only inside the app's own files/cache directories.
 */
class DocumentRenderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CashTravelDocumentRender")

    // The user-visible name of a picked file (SAF content:// URIs carry only an opaque id).
    Function("contentDisplayName") { uri: String -> displayName(Uri.parse(uri)) }

    AsyncFunction("pdfPageSizes") { uri: String ->
      withPdf(privateFile(uri)) { pdf ->
        (0 until pdf.pageCount).map { i -> pdf.openPage(i).use { p -> listOf(p.width, p.height) } }
      }
    }

    AsyncFunction("renderPdfPage") { uri: String, page: Int, widthPx: Int, outUri: String ->
      val out = privateFile(outUri)
      if (out.isFile && out.length() > 0) {
        bounds(out)
      } else {
        withPdf(privateFile(uri)) { pdf ->
          if (page < 0 || page >= pdf.pageCount) throw CodedException("ERR_PDF_PAGE", "No page $page", null)
          pdf.openPage(page).use { p ->
            val w = widthPx.coerceIn(64, 4096)
            val h = (w.toLong() * p.height / max(1, p.width)).toInt().coerceIn(1, 8192)
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            try {
              bmp.eraseColor(Color.WHITE)
              p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              writeJpeg(bmp, out)
            } finally {
              bmp.recycle()
            }
            mapOf("width" to w, "height" to h)
          }
        }
      }
    }

    AsyncFunction("renderImage") { uri: String, maxPx: Int, outUri: String ->
      val out = privateFile(outUri)
      if (out.isFile && out.length() > 0) {
        bounds(out)
      } else {
        val decoded = decode(privateFile(uri), maxPx.coerceIn(256, 4096))
        // JPEG has no transparency: flatten PNG alpha onto white.
        val opaque = if (decoded.hasAlpha()) {
          Bitmap.createBitmap(decoded.width, decoded.height, Bitmap.Config.ARGB_8888).also {
            Canvas(it).apply {
              drawColor(Color.WHITE)
              drawBitmap(decoded, 0f, 0f, null)
            }
          }
        } else {
          decoded
        }
        try {
          writeJpeg(opaque, out)
          mapOf("width" to opaque.width, "height" to opaque.height)
        } finally {
          if (opaque !== decoded) opaque.recycle()
          decoded.recycle()
        }
      }
    }
  }

  private fun privateFile(uri: String): File {
    val context = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "App context unavailable", null)
    val path = Uri.parse(uri).path ?: throw CodedException("ERR_FILE_URI", "Invalid file URI", null)
    val file = File(path).canonicalFile
    val roots = listOf(context.filesDir, context.cacheDir).map { it.canonicalFile.path + File.separator }
    if (roots.none { file.path.startsWith(it) }) throw CodedException("ERR_FILE_SCOPE", "File outside app storage", null)
    return file
  }

  /** Only the name column is read — never the content. Null when unknown. */
  private fun displayName(uri: Uri): String? {
    if (uri.scheme != "content") return null
    return try {
      appContext.reactContext?.contentResolver
        ?.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { c -> if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null }
    } catch (e: Exception) {
      null
    }
  }

  private fun <T> withPdf(file: File, block: (PdfRenderer) -> T): T =
    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd -> PdfRenderer(fd).use(block) }

  /** Decodes with EXIF orientation applied (ImageDecoder) and the longest side limited to [limit]. */
  private fun decode(file: File, limit: Int): Bitmap {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      return ImageDecoder.decodeBitmap(ImageDecoder.createSource(file)) { decoder, info, _ ->
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        val longest = max(info.size.width, info.size.height)
        if (longest > limit) {
          val scale = limit.toDouble() / longest
          decoder.setTargetSize(max(1, (info.size.width * scale).toInt()), max(1, (info.size.height * scale).toInt()))
        }
      }
    }
    val probe = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, probe)
    var sample = 1
    while (max(probe.outWidth, probe.outHeight) / (sample * 2) >= limit) sample *= 2
    return BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: throw CodedException("ERR_IMAGE_DECODE", "Unsupported image", null)
  }

  /** Written to a temporary name first, so an interrupted render is never reused as a cached one. */
  private fun writeJpeg(bmp: Bitmap, out: File) {
    out.parentFile?.mkdirs()
    val tmp = File(out.parentFile, out.name + ".part")
    FileOutputStream(tmp).use { stream ->
      if (!bmp.compress(Bitmap.CompressFormat.JPEG, 90, stream)) throw CodedException("ERR_RENDER_WRITE", "Could not encode page", null)
    }
    if (!tmp.renameTo(out)) {
      tmp.delete()
      throw CodedException("ERR_RENDER_WRITE", "Could not store page", null)
    }
  }

  private fun bounds(file: File): Map<String, Int> {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, o)
    return mapOf("width" to min(o.outWidth, 8192), "height" to min(o.outHeight, 8192))
  }
}
