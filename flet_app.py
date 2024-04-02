import tzlocal
import flet as ft
from datetime import datetime, timezone
from tinydb import TinyDB, Query

db = TinyDB('time_tree.json')  # Initialize the database

class TimeTree:
    def __init__(self, page: ft.Page) -> None:
        self.page = page
        self.main_attributes()
        self.configure_page()
        self.main_page()
        self.update_entries_list()
        self.update_current_task(self.root_task())
    
    def root_task(self):
        return {'doc_id': 0, 'description': 'Root'}

    def main_attributes(self):
        self.running = False
        self.start_time = None
        self.end_time = None
        self.description = None
        self.current_task = 0
        self.top_bar_title = ft.Text(value="")  # Initialize top bar title

    def configure_page(self):
        self.page.bgcolor = ft.colors.BROWN_600
        self.page.padding = 0
        self.page.window_width = 350
        self.page.window_height = 450
        self.page.window_resizable = True
        self.page.window_always_on_top = True
        self.page.title = "Time Tree"

    def update_entries_list(self):
        self.entries_list.content.controls.clear()
        entries = db.search(Query().parent_id == self.current_task)
        for entry in entries:
            s_time, e_time = [entry[t][2:].replace('-', '/').replace('T', ' ') for t in ['start_time', 'end_time']]
            # TODO: Add a white thin border to each list tile
            list_tile = ft.Container(
                ft.ListTile(
                  title=ft.Text(value=f"{entry['description']}"),
                  subtitle=ft.Text(value=f"Start: {s_time}\nEnd: {e_time}\nTime elapsed: {entry['duration']}s"),
                  leading=ft.IconButton(icon=ft.icons.TASK, on_click=lambda e, entry=entry: self.update_current_task(entry, e))),
                border = ft.border.all(1, ft.colors.WHITE),
                border_radius = self.page.window_width * .025,
              )
            self.entries_list.content.controls.append(list_tile)
        self.entries_list.update()
        self.page.update()

    def update_current_task(self, entry, event = None):
        self.current_task = entry['doc_id'] if 'doc_id' in entry else entry.doc_id
        self.top_bar_title.value = f'#{self.current_task} {entry["description"]}'
        self.update_entries_list()
        self.page.update()

    def go_back(self, _):
        if self.current_task != 0:  # Check if it's not the root
            current_entry = db.get(doc_id = self.current_task)
            parent_id = current_entry['parent_id']
            parent_entry = db.get(doc_id = parent_id) if parent_id != 0 else self.root_task()
            if parent_entry:
                self.update_current_task(parent_entry)

    def get_local_time(self):
        return datetime.now(timezone.utc).astimezone(tzlocal.get_localzone())
    
    def stopper(self):
        self.running = False
        self.end_time = self.get_local_time()
        duration = self.end_time - self.start_time
        self.description = self.description_input.content.value
        db.insert({
            'start_time': self.start_time.isoformat(timespec='seconds'), 
            'end_time': self.end_time.isoformat(timespec='seconds'), 
            'duration': round(duration.total_seconds()), 
            'description': self.description,
            'parent_id': self.current_task
        })
        self.description_input.content.value = ""  # Clear the input
        self.description_input.visible = False  # Hide the input field
        self.entries_list.visible = True  # Show the entries list
        self.main_button.icon = "play_arrow"
        self.main_button.tooltip = "Start Timer"
        self.main_button.bgcolor = ft.colors.GREEN_700
        self.top_bar.bgcolor = ft.colors.BROWN_800
        self.page.bgcolor = ft.colors.BROWN_600
        self.update_entries_list()  # Update the entries list after stopping the timer
    
    def starter(self):
        self.running = True
        self.start_time = self.get_local_time()
        self.end_time = None
        self.description_input.visible = True
        self.entries_list.visible = False
        self.main_button.icon = "stop"
        self.main_button.tooltip = "Stop Timer"
        self.main_button.bgcolor = ft.colors.BROWN_700
        self.top_bar.bgcolor = ft.colors.GREEN_800
        self.page.bgcolor = ft.colors.GREEN_600
    
    def toggle_timer(self, _):
        self.stopper() if self.running else self.starter()
        self.page.update()
    
    def main_page(self):
        back_button = ft.IconButton(icon=ft.icons.ARROW_BACK, on_click=self.go_back, icon_color=ft.colors.WHITE)
        self.top_bar = ft.Container(
          content=ft.Row(controls=[back_button, self.top_bar_title]),  # Add back button to top bar
          bgcolor=ft.colors.BROWN_800,
          width=self.page.window_width,
          height=self.page.window_height * .1)
        self.description_input = ft.Container(
            ft.TextField(hint_text="Enter task description", expand=True, width=self.page.window_width * .95, height=self.page.window_height * .1),
            alignment=ft.alignment.center,
            visible=False)
        self.entries_list = ft.Container(
            ft.ListView(
              width=self.page.window_width * .95,
              height=self.page.window_height * .8,
              spacing=self.page.window_width * .025),
            alignment=ft.alignment.top_center,
            margin=0,
            padding=0,
          )
        self.main_button = ft.FloatingActionButton(icon="play_arrow", tooltip="Start Timer", on_click=self.toggle_timer, bgcolor=ft.colors.GREEN_700)
        self.page.add(self.top_bar)
        self.page.add(self.main_button)
        self.page.add(self.description_input)
        self.page.add(self.entries_list)
        self.update_entries_list()

ft.app(target=TimeTree)
