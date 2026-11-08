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
import java.util.UUID

class CuraTasksWidget : AppWidgetProvider() {

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
            val views = RemoteViews(context.packageName, R.layout.widget_tasks)

            // Header & root default deep link to cura://tasks
            val openTasksIntent = Intent(Intent.ACTION_VIEW, Uri.parse("cura://tasks")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val openTasksPi = PendingIntent.getActivity(
                context,
                1001,
                openTasksIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_tasks_header, openTasksPi)
            views.setOnClickPendingIntent(R.id.tv_tasks_placeholder, openTasksPi)

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

                val tasksObj = snapshotJson.optJSONObject("tasks")

                if (tasksObj == null) {
                    showPlaceholder(views, "Open Cura to refresh")
                    appWidgetManager.updateAppWidget(appWidgetId, views)
                    return
                }

                val todayTotal = tasksObj.optInt("todayTotal", 0)
                val todayCompleted = tasksObj.optInt("todayCompleted", 0)
                val overdueCount = tasksObj.optInt("overdueCount", 0)
                val itemsArray = tasksObj.optJSONArray("items")

                // Update summary badge
                views.setTextViewText(R.id.tv_tasks_summary, "$todayCompleted / $todayTotal done")

                // Update overdue badge
                if (overdueCount > 0) {
                    views.setViewVisibility(R.id.tv_tasks_overdue, View.VISIBLE)
                    views.setTextViewText(R.id.tv_tasks_overdue, "$overdueCount overdue")
                } else {
                    views.setViewVisibility(R.id.tv_tasks_overdue, View.GONE)
                }

                val itemCount = itemsArray?.length() ?: 0

                if (itemCount == 0) {
                    showPlaceholder(views, "No tasks today - Enjoy your day")
                } else {
                    views.setViewVisibility(R.id.tv_tasks_placeholder, View.GONE)
                    views.setViewVisibility(R.id.layout_tasks_items, View.VISIBLE)

                    val rowIds = intArrayOf(
                        R.id.task_row_0, R.id.task_row_1, R.id.task_row_2, R.id.task_row_3, R.id.task_row_4
                    )
                    val checkIds = intArrayOf(
                        R.id.task_check_0, R.id.task_check_1, R.id.task_check_2, R.id.task_check_3, R.id.task_check_4
                    )
                    val titleIds = intArrayOf(
                        R.id.task_title_0, R.id.task_title_1, R.id.task_title_2, R.id.task_title_3, R.id.task_title_4
                    )
                    val timeIds = intArrayOf(
                        R.id.task_time_0, R.id.task_time_1, R.id.task_time_2, R.id.task_time_3, R.id.task_time_4
                    )

                    // Display up to 5 items
                    val displayLimit = minOf(itemCount, 5)
                    for (i in 0 until 5) {
                        if (i < displayLimit) {
                            val item = itemsArray!!.getJSONObject(i)
                            val taskId = item.optString("id", "")
                            val title = item.optString("title", "")
                            val dueTime = item.optString("dueTime", "")
                            val isTimed = item.optBoolean("isTimed", false)
                            val status = item.optString("status", "pending")
                            val isCompleted = (status == "completed")

                            views.setViewVisibility(rowIds[i], View.VISIBLE)
                            views.setTextViewText(titleIds[i], title)

                            // Checkmark state
                            if (isCompleted) {
                                views.setTextViewText(checkIds[i], "✓")
                                views.setTextColor(titleIds[i], 0xFF8588A3.toInt()) // dimmed
                            } else {
                                views.setTextViewText(checkIds[i], "○")
                                views.setTextColor(titleIds[i], 0xFFFFFFFF.toInt())
                            }

                            // Due time if timed
                            if (isTimed && dueTime.isNotBlank()) {
                                views.setViewVisibility(timeIds[i], View.VISIBLE)
                                views.setTextViewText(timeIds[i], dueTime)
                            } else {
                                views.setViewVisibility(timeIds[i], View.GONE)
                            }

                            // Tap checkbox or row to toggle task via deep link
                            val targetState = if (isCompleted) "pending" else "completed"
                            val nowIso = Instant.now().toString()
                            val actionId = UUID.randomUUID().toString()

                            val actionUri = Uri.parse("cura://widget-action")
                                .buildUpon()
                                .appendQueryParameter("action_id", actionId)
                                .appendQueryParameter("action_type", "task_toggle")
                                .appendQueryParameter("target_id", taskId)
                                .appendQueryParameter("requested_state", targetState)
                                .appendQueryParameter("user_id", userId)
                                .appendQueryParameter("client_action_time", nowIso)
                                .build()

                            val actionIntent = Intent(Intent.ACTION_VIEW, actionUri).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                            }
                            val actionPi = PendingIntent.getActivity(
                                context,
                                2000 + i,
                                actionIntent,
                                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                            )

                            views.setOnClickPendingIntent(rowIds[i], actionPi)
                            views.setOnClickPendingIntent(checkIds[i], actionPi)
                        } else {
                            views.setViewVisibility(rowIds[i], View.GONE)
                        }
                    }
                }
            } catch (e: Exception) {
                showPlaceholder(views, "Open Cura to refresh")
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun showPlaceholder(views: RemoteViews, message: String) {
            views.setViewVisibility(R.id.tv_tasks_placeholder, View.VISIBLE)
            views.setTextViewText(R.id.tv_tasks_placeholder, message)
            views.setViewVisibility(R.id.layout_tasks_items, View.GONE)
            views.setTextViewText(R.id.tv_tasks_summary, "0 / 0 done")
            views.setViewVisibility(R.id.tv_tasks_overdue, View.GONE)
        }
    }
}
