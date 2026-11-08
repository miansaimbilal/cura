package expo.modules.widgetbridge

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.core.util.AtomicFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID
import org.json.JSONObject

class ExpoWidgetBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoWidgetBridge")

    AsyncFunction("publishSnapshot") { options: Map<String, Any?> ->
      val userId = options["userId"] as? String ?: return@AsyncFunction false
      val epoch = (options["epoch"] as? Number)?.toInt() ?: return@AsyncFunction false
      val revision = (options["revision"] as? Number)?.toInt() ?: return@AsyncFunction false
      val contentJson = options["contentJson"] as? String ?: return@AsyncFunction false
      val candidateFileNameParam = options["candidateFile"] as? String

      val context = appContext.reactContext ?: appContext.applicationContext
      val snapshotsDir = File(context.filesDir, "snapshots")
      if (!snapshotsDir.exists()) {
        snapshotsDir.mkdirs()
      }

      val uuid = UUID.randomUUID().toString()
      val candidateFileName = if (!candidateFileNameParam.isNullOrBlank()) {
        candidateFileNameParam
      } else {
        "snapshot_${userId}_${epoch}_${revision}_${uuid}.json"
      }

      val candidateFile = File(snapshotsDir, candidateFileName)
      val tmpCandidateFile = File(snapshotsDir, "$candidateFileName.tmp")

      // 1. Write candidate snapshot to .tmp and atomically rename to final versioned file
      try {
        FileOutputStream(tmpCandidateFile).use { fos ->
          fos.write(contentJson.toByteArray(StandardCharsets.UTF_8))
          fos.flush()
          fos.fd.sync()
        }
        if (!tmpCandidateFile.renameTo(candidateFile)) {
          tmpCandidateFile.delete()
          return@AsyncFunction false
        }
      } catch (e: Exception) {
        tmpCandidateFile.delete()
        return@AsyncFunction false
      }

      // 2. Acquire exclusive advisory lock for pointer swap and safe pruning
      val lockFile = File(snapshotsDir, ".manifest.lock")
      if (!lockFile.exists()) {
        lockFile.createNewFile()
      }

      FileOutputStream(lockFile).use { lockFos ->
        val channel = lockFos.channel
        val lock = channel.lock()
        try {
          val manifestFile = File(snapshotsDir, "current.json")
          var currentManifest: JSONObject? = null
          var previousActiveFile: String? = null

          if (manifestFile.exists()) {
            try {
              val manifestBytes = manifestFile.readBytes()
              currentManifest = JSONObject(String(manifestBytes, StandardCharsets.UTF_8))
              previousActiveFile = currentManifest.optString("activeFile", null)
            } catch (e: Exception) {
              // Unreadable manifest; treat as empty
            }
          }

          if (currentManifest != null) {
            val currentEpoch = currentManifest.optInt("accountEpoch", 0)
            val currentRevision = currentManifest.optInt("revision", 0)

            // Stale publication check: reject if epoch is older or revision is not strictly greater
            if (epoch < currentEpoch || (epoch == currentEpoch && revision <= currentRevision)) {
              candidateFile.delete()
              return@AsyncFunction false
            }

            // User or epoch boundary switch: invalidate old-account snapshots
            val currentUserId = currentManifest.optString("userId", "")
            if (currentUserId != userId || currentEpoch != epoch) {
              val allFiles = snapshotsDir.listFiles() ?: emptyArray()
              for (f in allFiles) {
                if (f.name != candidateFile.name && f.name != ".manifest.lock" && f.name != "current.json") {
                  f.delete()
                }
              }
              previousActiveFile = null
            }
          }

          // 3. Atomically write pointer manifest current.json via AtomicFile
          val atomicManifest = AtomicFile(manifestFile)
          val nowIso = Instant.now().toString()
          val newManifest = JSONObject().apply {
            put("activeFile", candidateFile.name)
            put("accountEpoch", epoch)
            put("revision", revision)
            put("userId", userId)
            put("updatedAt", nowIso)
          }

          val manifestBytes = newManifest.toString(2).toByteArray(StandardCharsets.UTF_8)
          val fos = atomicManifest.startWrite()
          try {
            fos.write(manifestBytes)
            atomicManifest.finishWrite(fos)
          } catch (e: Exception) {
            atomicManifest.failWrite(fos)
            throw e
          }

          // 4. Safe retention pruning (N-1 window): retain candidateFile and previousActiveFile
          val keepSet = mutableSetOf(candidateFile.name)
          if (!previousActiveFile.isNullOrBlank()) {
            keepSet.add(previousActiveFile)
          }

          val currentTimeMs = System.currentTimeMillis()
          val allFiles = snapshotsDir.listFiles() ?: emptyArray()
          for (f in allFiles) {
            val name = f.name
            if (name == ".manifest.lock" || name == "current.json" || name == "current.json.bak") {
              continue
            }
            if (name.endsWith(".tmp")) {
              if (currentTimeMs - f.lastModified() > 60000) {
                f.delete()
              }
            } else if (name.startsWith("snapshot_")) {
              if (!keepSet.contains(name)) {
                f.delete()
              }
            }
          }

            // Lock released in finally block below
          } finally {
            try {
              lock.release()
            } catch (e: Exception) {
              // Ignore lock release failures
            }
          }

          // Trigger home-screen widget views update
          try {
            val appWidgetManager = AppWidgetManager.getInstance(context)

            val tasksComponent = ComponentName(context, CuraTasksWidget::class.java)
            val tasksIds = appWidgetManager.getAppWidgetIds(tasksComponent)
            for (id in tasksIds) {
              CuraTasksWidget.updateAppWidget(context, appWidgetManager, id)
            }

            val moodComponent = ComponentName(context, CuraMoodWidget::class.java)
            val moodIds = appWidgetManager.getAppWidgetIds(moodComponent)
            for (id in moodIds) {
              CuraMoodWidget.updateAppWidget(context, appWidgetManager, id)
            }
          } catch (e: Exception) {
            // Safe fallback if widget manager unavailable
          }

          return@AsyncFunction true
        }
    }

    AsyncFunction("readCurrentManifest") {
      val context = appContext.reactContext ?: appContext.applicationContext
      val manifestFile = File(context.filesDir, "snapshots/current.json")
      if (!manifestFile.exists()) {
        return@AsyncFunction null
      }
      try {
        val jsonStr = manifestFile.readText(StandardCharsets.UTF_8)
        val json = JSONObject(jsonStr)
        val map = mutableMapOf<String, Any>()
        map["activeFile"] = json.getString("activeFile")
        map["accountEpoch"] = json.getInt("accountEpoch")
        map["revision"] = json.getInt("revision")
        map["userId"] = json.getString("userId")
        map["updatedAt"] = json.getString("updatedAt")
        return@AsyncFunction map
      } catch (e: Exception) {
        return@AsyncFunction null
      }
    }

    AsyncFunction("clearSnapshots") {
      val context = appContext.reactContext ?: appContext.applicationContext
      val snapshotsDir = File(context.filesDir, "snapshots")
      if (snapshotsDir.exists()) {
        snapshotsDir.listFiles()?.forEach { file ->
          if (file.name != ".manifest.lock") {
            file.delete()
          }
        }
      }
      return@AsyncFunction true
    }
  }
}
