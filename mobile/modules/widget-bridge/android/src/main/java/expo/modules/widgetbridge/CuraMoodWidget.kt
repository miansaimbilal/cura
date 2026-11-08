package expo.modules.widgetbridge

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

class CuraMoodWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        private const val MAX_SNAPSHOT_BYTES = 1024 * 1024 // 1 MB Binder safety limit

        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_mood)

            // Header & root default deep link to cura://mood
            val openMoodIntent = Intent(Intent.ACTION_VIEW, Uri.parse("cura://mood")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val openMoodPi = PendingIntent.getActivity(
                context,
                3001,
                openMoodIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_mood_header, openMoodPi)
            views.setOnClickPendingIntent(R.id.tv_mood_placeholder, openMoodPi)

            try {
                val manifestFile = File(context.filesDir, "snapshots/current.json")
                if (!manifestFile.exists() || manifestFile.length() > MAX_SNAPSHOT_BYTES) {
                    showPlaceholder(views, "Open Cura to refresh")
                    appWidgetManager.updateAppWidget(appWidgetId, views)
                    return
                }

                val manifestJson = JSONObject(manifestFile.readText(Charsets.UTF_8))
                val activeFileName = manifestJson.optString("activeFile", "")
                val userId = manifestJson.optString("userId", "")
                val manifestEpoch = manifestJson.optInt("accountEpoch", -1)

                if (activeFileName.isBlank() || userId.isBlank()) {
                    showPlaceholder(views, "Open Cura to refresh")
                    appWidgetManager.updateAppWidget(appWidgetId, views)
                    return
                }

                val snapshotFile = File(context.filesDir, "snapshots/$activeFileName")
                if (!snapshotFile.exists() || snapshotFile.length() > MAX_SNAPSHOT_BYTES) {
                    showPlaceholder(views, "Open Cura to refresh")
                    appWidgetManager.updateAppWidget(appWidgetId, views)
                    return
                }

                val snapshotJson = JSONObject(snapshotFile.readText(Charsets.UTF_8))
                val snapshotEpoch = snapshotJson.optInt("accountEpoch", -1)
                val snapshotUserId = snapshotJson.optString("userId", "")

                // Epoch & user boundary verification
                if (snapshotEpoch != -1 && manifestEpoch != -1 && snapshotEpoch != manifestEpoch) {
                    showPlaceholder(views, "Open Cura to refresh")
                    appWidgetManager.updateAppWidget(appWidgetId, views)
                    return
                }
                if (snapshotUserId.isNotBlank() && userId.isNotBlank() && snapshotUserId != userId) {
                    showPlaceholder(views, "Open Cura to refresh")
                    appWidgetManager.updateAppWidget(appWidgetId, views)
                    return
                }

                val moodObj = snapshotJson.optJSONObject("mood")
                val quoteObj = snapshotJson.optJSONObject("quote")

                views.setViewVisibility(R.id.tv_mood_placeholder, View.GONE)
                views.setViewVisibility(R.id.tv_latest_mood, View.VISIBLE)
                views.setViewVisibility(R.id.tv_mood_quote, View.VISIBLE)
                views.setViewVisibility(R.id.layout_mood_buttons, View.VISIBLE)

                // 1. Latest Mood
                val latestMoodType = moodObj?.optString("latestMoodType", null)
                val latestLoggedAt = moodObj?.optString("latestLoggedAt", null)

                if (!latestMoodType.isNullOrBlank()) {
                    val moodCapitalized = latestMoodType.replaceFirstChar {
                        if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString()
                    }
                    val formattedTime = formatLoggedTime(latestLoggedAt)
                    views.setTextViewText(R.id.tv_latest_mood, "Feeling $moodCapitalized")
                    views.setTextViewText(R.id.tv_mood_logged_time, formattedTime)
                } else {
                    views.setTextViewText(R.id.tv_latest_mood, "How are you feeling?")
                    views.setTextViewText(R.id.tv_mood_logged_time, "")
                }

                // 2. Mindful Quote
                if (quoteObj != null) {
                    val text = quoteObj.optString("text", "Breathe in peace, breathe out tension.")
                    val author = quoteObj.optString("author", "Cura")
                    views.setTextViewText(R.id.tv_mood_quote, "\"$text\" — $author")
                } else {
                    views.setTextViewText(R.id.tv_mood_quote, "Take a deep breath and be present.")
                }

                // 3. 5 Quick Mood Selection Buttons (Happy, Calm, Sad, Stressed, Tired)
                val moodButtons = arrayOf(
                    Pair(R.id.btn_mood_happy, "happy"),
                    Pair(R.id.btn_mood_calm, "calm"),
                    Pair(R.id.btn_mood_sad, "sad"),
                    Pair(R.id.btn_mood_stressed, "stressed"),
                    Pair(R.id.btn_mood_tired, "tired")
                )

                val nowIso = Instant.now().toString()
                for ((idx, pair) in moodButtons.withIndex()) {
                    val (btnId, moodType) = pair
                    val actionId = UUID.randomUUID().toString()

                    val actionUri = Uri.parse("cura://widget-action")
                        .buildUpon()
                        .appendQueryParameter("action_id", actionId)
                        .appendQueryParameter("action_type", "mood_log")
                        .appendQueryParameter("target_id", "widget_mood")
                        .appendQueryParameter("requested_state", "{\"moodType\":\"$moodType\"}")
                        .appendQueryParameter("user_id", userId)
                        .appendQueryParameter("client_action_time", nowIso)
                        .build()

                    val actionIntent = Intent(Intent.ACTION_VIEW, actionUri).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    }
                    val actionPi = PendingIntent.getActivity(
                        context,
                        4000 + idx,
                        actionIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    views.setOnClickPendingIntent(btnId, actionPi)
                }
            } catch (e: Exception) {
                showPlaceholder(views, "Open Cura to refresh")
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun showPlaceholder(views: RemoteViews, message: String) {
            views.setViewVisibility(R.id.tv_mood_placeholder, View.VISIBLE)
            views.setTextViewText(R.id.tv_mood_placeholder, message)
            views.setViewVisibility(R.id.tv_latest_mood, View.GONE)
            views.setViewVisibility(R.id.tv_mood_quote, View.GONE)
            views.setTextViewText(R.id.tv_mood_logged_time, "")
        }

        private fun formatLoggedTime(isoString: String?): String {
            if (isoString.isNullOrBlank()) return ""
            return try {
                val zdt = ZonedDateTime.parse(isoString).withZoneSameInstant(ZoneId.systemDefault())
                val today = LocalDate.now()
                val logDate = zdt.toLocalDate()

                if (logDate.isEqual(today)) {
                    val timeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault())
                    "Today, ${zdt.format(timeFormatter)}"
                } else if (logDate.isEqual(today.minusDays(1))) {
                    "Yesterday"
                } else {
                    val dateFormatter = DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())
                    zdt.format(dateFormatter)
                }
            } catch (e: Exception) {
                ""
            }
        }
    }
}
